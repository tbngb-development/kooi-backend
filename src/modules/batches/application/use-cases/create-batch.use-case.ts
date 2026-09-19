import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { FileStorageProvider } from "../../../../shared/config/external/storage/file-storage.interface";
import type { BolnaBatchProvider } from "../../infrastructure/bolna-batch-provider.interface";
import type { CreateBatchInput, CreateBatchOutput } from "../dto/batch.dto";
import {
  CampaignNotFoundError,
  CampaignFailedError,
} from "../../../campaigns/domain/errors/campaign.errors";
import {
  EmptyFileError,
  NoValidIndianPhonesError,
  AllLeadsDuplicateError,
  BolnaBatchCreationError,
} from "../../domain/errors/batch.errors";
import {
  parseLeadBuffer,
  isIndianPhone,
  type LeadRow,
} from "../../../leads/infrastructure/leadParser";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { transformToBolnaCSV } from "../../infrastructure/csv-transformer";
import { env } from "../../../../shared/config/env";
import { type RetryConfig } from "../../../../shared/types/bolna.types";

export class CreateBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly storage: FileStorageProvider,
    private readonly bolnaProvider: BolnaBatchProvider,
  ) {}

  async execute(input: CreateBatchInput): Promise<CreateBatchOutput> {
    // 1. Validate campaign
    const campaign = await this.campaignRepo.findByIdWithRelations(
      input.tenantId,
      input.campaignId,
    );
    if (!campaign) throw new CampaignNotFoundError();
    if (campaign.status === "FAILED")
      throw new CampaignFailedError("upload to");
    if (!campaign.assistant) throw new CampaignNotFoundError();

    // 2. Parse file
    const { rows } = parseLeadBuffer(input.fileBuffer, input.fileName);
    if (rows.length === 0) throw new EmptyFileError();

    // 3. Filter + normalize Indian phones
    const validRows = rows
      .filter((r) => r.phone && r.phone.trim() !== "" && isIndianPhone(r.phone))
      .map((r) => ({ ...r, phone: normalizePhoneNumber(r.phone) }));

    if (validRows.length === 0) throw new NoValidIndianPhonesError();

    // 4. In-file dedup
    const seenInFile = new Set<string>();
    const uniqueRows: LeadRow[] = [];
    for (const row of validRows) {
      if (!seenInFile.has(row.phone)) {
        seenInFile.add(row.phone);
        uniqueRows.push(row);
      }
    }

    // 5. Cross-batch dedup
    let newLeads = uniqueRows;
    if (!env.skipCrossBatchDedup) {
      const phones = uniqueRows.map((r) => r.phone);
      const existingPhones = await this.batchRepo.findExistingPhones(
        input.campaignId,
        phones,
      );
      newLeads = uniqueRows.filter((r) => !existingPhones.has(r.phone));
    }

    if (newLeads.length === 0) throw new AllLeadsDuplicateError();

    // 6. Resolve retry config
    const resolvedRetryConfig: RetryConfig | undefined =
      input.retryConfig ??
      (campaign.defaultRetryConfig as RetryConfig | null) ??
      undefined;

    // 7. Create batch + leads in DB
    const batch = await this.batchRepo.create({
      campaignId: input.campaignId,
      tenantId: input.tenantId,
      fileName: input.fileName,
      totalLeads: newLeads.length,
      retryConfig: resolvedRetryConfig,
    });

    await this.batchRepo.createLeads(
      newLeads.map((row) => ({
        name: row.name,
        phone: row.phone,
        email: row.email,
        company: row.company,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        batchId: batch.id,
        metadata: row as Record<string, unknown>,
      })),
    );

    // 8. Upload original file to Cloudinary for reference
    let originalFileUrl: string | undefined;
    try {
      originalFileUrl = await this.storage.uploadBuffer(
        input.fileBuffer,
        `original-${input.fileName}`,
        `kooi/${input.tenantId}/campaigns/${input.campaignId}/batches/${batch.id}`,
      );
    } catch (err) {
      console.error("[CreateBatch] Original file upload failed:", err);
    }

    // 9. Transform to Bolna CSV in memory
    const campaignVariables =
      (campaign.variables as Record<string, string>) ?? {};
    const { transformedBuffer, validCount, filteredOutCount } =
      transformToBolnaCSV(newLeads, campaignVariables);

    // 10. Send transformed buffer directly to Bolna API
    let bolnaBatchId: string | undefined;
    const webhookUrl = env.webhook.baseUrl
      ? `${env.webhook.baseUrl}/api/webhooks/bolna-batch`
      : undefined;

    try {
      const result = await this.bolnaProvider.createBatch(input.tenantId, {
        agentId: campaign.assistant.platformAgent.bolnaId,
        csvBuffer: transformedBuffer,
        fileName: `bolna-${batch.id}.csv`,
        retryConfig: resolvedRetryConfig,
        webhookUrl,
      });
      bolnaBatchId = result.batch_id;
    } catch (err) {
      await this.batchRepo.update(batch.id, { status: "FAILED" });
      throw new BolnaBatchCreationError(
        err instanceof Error ? err.message : String(err),
      );
    }

    // 11. Final update
    const updatedBatch = await this.batchRepo.update(batch.id, {
      bolnaBatchId,
      originalFileUrl,
    });

    await this.campaignRepo.incrementTotalLeads(
      input.campaignId,
      newLeads.length,
    );

    return {
      batch: updatedBatch as unknown as Record<string, unknown>,
      stats: {
        totalRows: rows.length,
        validIndian: validCount,
        filteredNonIndian: filteredOutCount,
        imported: newLeads.length,
      },
    };
  }
}
