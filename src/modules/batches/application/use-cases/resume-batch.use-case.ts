import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { FileStorageProvider } from "../../../../shared/config/external/storage/file-storage.interface";
import type { BolnaBatchProvider } from "../../infrastructure/bolna-batch-provider.interface";
import type { ResumeBatchOutput } from "../dto/batch.dto";
import {
  BatchNotFoundError,
  BatchOperationError,
  BatchNoPendingLeadsError,
  BolnaBatchCreationError,
} from "../../domain/errors/batch.errors";
import { CampaignNotFoundError } from "../../../campaigns/domain/errors/campaign.errors";
import { transformToBolnaCSV } from "../../infrastructure/csv-transformer";
import { env } from "../../../../shared/config/env";
import type { LeadRow } from "../../../leads/infrastructure/leadParser";
import type { RetryConfig } from "../../../../shared/types/bolna.types";

export class ResumeBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly storage: FileStorageProvider,
    private readonly bolnaProvider: BolnaBatchProvider,
  ) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<ResumeBatchOutput> {
    const batchData = await this.batchRepo.findById(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batchData) throw new BatchNotFoundError();
    if (batchData.status !== "STOPPED") {
      throw new BatchOperationError(
        `Cannot resume batch in "${batchData.status}" status.`,
      );
    }

    const pendingLeads = await this.batchRepo.findPendingLeads(batchId);
    if (pendingLeads.length === 0) throw new BatchNoPendingLeadsError();

    const campaign = await this.campaignRepo.findByIdWithRelations(
      tenantId,
      campaignId,
    );
    if (!campaign || !campaign.assistant) throw new CampaignNotFoundError();

    // Create new batch
    const newBatch = await this.batchRepo.create({
      campaignId,
      tenantId,
      fileName: `resume-${batchData.fileName ?? batchId}`,
      totalLeads: pendingLeads.length,
      retryConfig: batchData.retryConfig,
      termsAccepted: batchData.termsAccepted,
      termsAcceptedAt: new Date(),
      termsVersion: batchData.termsVersion ?? "v1",
    });

    // Reassign leads
    await this.batchRepo.reassignLeadsToBatch(batchId, newBatch.id);
    await this.batchRepo.decrementTotalLeads(batchId, pendingLeads.length);

    // Build Bolna CSV
    const campaignVariables =
      (campaign.variables as Record<string, string>) ?? {};

    const leadRows: LeadRow[] = pendingLeads.map((l) => ({
      name: l.name,
      phone: l.phone,
      email: l.email ?? undefined,
      company: l.company ?? undefined,
      ...(l.metadata ?? {}),
    }));

    const { transformedBuffer } = transformToBolnaCSV(
      leadRows,
      campaignVariables,
    );

    const webhookUrl = env.webhook.baseUrl
      ? `${env.webhook.baseUrl}/api/webhooks/bolna-batch`
      : undefined;

    const retryConfig = batchData.retryConfig ?? { enabled: false };

    let bolnaBatchId: string;
    try {
      const result = await this.bolnaProvider.createBatch(tenantId, {
        agentId: campaign.assistant.platformAgent.bolnaId,
        csvBuffer: transformedBuffer,
        fileName: `resume-${newBatch.id}.csv`,
        retryConfig: retryConfig as unknown as RetryConfig,
        webhookUrl,
      });
      bolnaBatchId = result.batch_id;
    } catch (err) {
      throw new BolnaBatchCreationError(
        err instanceof Error ? err.message : String(err),
      );
    }

    const updatedBatch = await this.batchRepo.update(newBatch.id, {
      bolnaBatchId,
    });

    return {
      originalBatchId: batchId,
      newBatch: updatedBatch as unknown as Record<string, unknown>,
      remainingLeads: pendingLeads.length,
      message: "New batch created from remaining leads.",
    };
  }
}
