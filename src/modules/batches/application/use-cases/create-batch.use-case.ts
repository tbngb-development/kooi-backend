import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../../shared/config/external/storage/file-storage.interface";
import type { BolnaBatchProvider } from "../../infrastructure/bolna-batch-provider.interface";
import type { CreateBatchInput, CreateBatchOutput } from "../dto/batch.dto";
import {
  CampaignNotFoundError,
  CampaignFailedError,
  MaxActiveCampaignsReachedError,
  RetryConfigNotAllowedError,
} from "../../../campaigns/domain/errors/campaign.errors";
import {
  EmptyFileError,
  NoValidIndianPhonesError,
  AllLeadsDuplicateError,
  BolnaBatchCreationError,
  MaxLeadsPerBatchExceededError,
  BatchOperationError,
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
import {
  toBolnaISO,
  parseBolnaScheduledTime,
} from "../../../../shared/utils/bolna-date";
import { ScheduledCampaignConflictError } from "../../../plans/domain/errors/plan.errors";

export class CreateBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly storage: FileStorageProvider,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly planRepo: PlanRepository, // [INJECTED]
  ) {}

  async execute(input: CreateBatchInput): Promise<CreateBatchOutput> {
    // 1. Validate campaign
    const campaign = await this.campaignRepo.findByIdWithRelations(
      input.tenantId,
      input.campaignId,
    );
    if (!campaign) throw new CampaignNotFoundError();
    if (campaign.status === "FAILED") {
      throw new CampaignFailedError("upload to");
    }
    if (!campaign.assistant) throw new CampaignNotFoundError();

    // 2. Fetch active tenant plan
    const activePlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );

    // ── [FAIL FAST] 3. Validate Plan Caps & Time-Conflicts BEFORE doing any I/O ──
    let targetScheduledDate: Date | null = null;

    if (input.scheduledAt) {
      targetScheduledDate = new Date(input.scheduledAt);
      if (isNaN(targetScheduledDate.getTime())) {
        throw new BatchOperationError("Invalid scheduled time format.");
      }
      if (targetScheduledDate.getTime() < Date.now()) {
        throw new BatchOperationError("Scheduled time must be in the future.");
      }

      if (
        activePlan &&
        activePlan.maxActiveCampaigns !== null &&
        activePlan.maxActiveCampaigns !== undefined
      ) {
        // Verify time overlap against other scheduled/running campaigns
        const conflictCount =
          await this.planRepo.countConcurrentCampaignsAtTime(
            input.tenantId,
            targetScheduledDate,
            input.campaignId, // Exclude this campaign
          );

        if (conflictCount >= activePlan.maxActiveCampaigns) {
          const formattedTime = targetScheduledDate.toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
            },
          );
          throw new ScheduledCampaignConflictError(
            formattedTime,
            activePlan.maxActiveCampaigns,
          );
        }
      }
    } else if (input.runImmediately) {
      // If immediate run is requested, check if it pushes the concurrent active campaign limit
      if (
        campaign.status !== "RUNNING" &&
        activePlan?.maxActiveCampaigns !== null &&
        activePlan?.maxActiveCampaigns !== undefined
      ) {
        const runningCount = await this.planRepo.countRunningCampaigns(
          input.tenantId,
        );
        if (runningCount >= activePlan.maxActiveCampaigns) {
          throw new MaxActiveCampaignsReachedError(
            activePlan.maxActiveCampaigns,
          );
        }
      }
    }

    // 4. Parse file
    const { rows } = parseLeadBuffer(input.fileBuffer, input.fileName);
    if (rows.length === 0) throw new EmptyFileError();

    // 5. Filter + normalize Indian phones
    const validRows = rows
      .filter((r) => r.phone && r.phone.trim() !== "" && isIndianPhone(r.phone))
      .map((r) => ({ ...r, phone: normalizePhoneNumber(r.phone) }));

    if (validRows.length === 0) throw new NoValidIndianPhonesError();

    // 6. In-file dedup
    const seenInFile = new Set<string>();
    const uniqueRows: LeadRow[] = [];
    for (const row of validRows) {
      if (!seenInFile.has(row.phone)) {
        seenInFile.add(row.phone);
        uniqueRows.push(row);
      }
    }

    // 7. Cross-batch dedup
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

    // 8. Enforce maxLeadsPerBatch limit (null = unlimited)
    if (
      activePlan &&
      activePlan.maxLeadsPerBatch !== null &&
      activePlan.maxLeadsPerBatch !== undefined
    ) {
      if (newLeads.length > activePlan.maxLeadsPerBatch) {
        throw new MaxLeadsPerBatchExceededError(
          activePlan.maxLeadsPerBatch,
          newLeads.length,
        );
      }
    }

    // 9. Resolve retry config + enforce plan retryAutomation capability
    let resolvedRetryConfig: RetryConfig | undefined =
      input.retryConfig ??
      (campaign.defaultRetryConfig as RetryConfig | null) ??
      undefined;

    if (resolvedRetryConfig?.enabled) {
      const retryAllowed = activePlan?.retryAutomation ?? false;
      if (!retryAllowed) {
        if (input.retryConfig?.enabled) {
          throw new RetryConfigNotAllowedError();
        }
        resolvedRetryConfig = undefined;
      }
    }

    // 10. Create batch initially as CREATED (will flip state on successful Bolna scheduling)
    const batch = await this.batchRepo.create({
      campaignId: input.campaignId,
      tenantId: input.tenantId,
      fileName: input.fileName,
      totalLeads: newLeads.length,
      retryConfig: resolvedRetryConfig,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: input.termsVersion,
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

    // 11. Upload original file to Cloudinary reference
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

    // 12. Transform to Bolna CSV in memory
    const campaignVariables =
      (campaign.variables as Record<string, string>) ?? {};
    const { transformedBuffer, validCount, filteredOutCount } =
      transformToBolnaCSV(newLeads, campaignVariables);

    // 13. Send transformed buffer to Bolna API
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

    // 14. If scheduledAt or runImmediately is set, schedule batch directly at Bolna
    let finalStatus: "CREATED" | "RUNNING" | "SCHEDULED" = "CREATED";
    let bolnaScheduledAt: Date | null = null;
    let localScheduledAt: Date | null = null;

    if (targetScheduledDate || input.runImmediately) {
      try {
        const scheduleTimeISO = toBolnaISO(targetScheduledDate ?? new Date());
        const scheduleRes = await this.bolnaProvider.scheduleBatch(
          input.tenantId,
          bolnaBatchId,
          scheduleTimeISO,
        );

        const parsedTimeStr = parseBolnaScheduledTime(scheduleRes.state);
        bolnaScheduledAt = parsedTimeStr ? new Date(parsedTimeStr) : null;
        localScheduledAt = targetScheduledDate ?? new Date();
        finalStatus = input.runImmediately ? "RUNNING" : "SCHEDULED";
      } catch (err) {
        await this.batchRepo.update(batch.id, { status: "FAILED" });
        throw new BolnaBatchCreationError(
          `Batch created but activation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 15. Complete the batch creation and apply transitions
    const updatedBatch = await this.batchRepo.update(batch.id, {
      bolnaBatchId,
      originalFileUrl,
      status: finalStatus,
      scheduledAt: localScheduledAt,
      bolnaScheduledAt,
    });

    await this.campaignRepo.incrementTotalLeads(
      input.campaignId,
      newLeads.length,
    );

    // 16. If running immediately, flip campaign status to RUNNING (DRAFT campaigns only)
    if (input.runImmediately && campaign.status === "DRAFT") {
      await this.campaignRepo.updateStatus(input.campaignId, "RUNNING", {
        startedAt: new Date(),
      });
    }

    // Generate readable response helper string for UI
    let message = "Batch uploaded and staged successfully.";
    if (input.runImmediately) {
      message = "Batch uploaded and processing started immediately.";
    } else if (targetScheduledDate) {
      const runsAt = (bolnaScheduledAt ?? targetScheduledDate).toLocaleString(
        "en-IN",
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      );
      message = `Batch scheduled successfully to start around ${runsAt}.`;
    }

    return {
      batch: updatedBatch as unknown as Record<string, unknown>,
      stats: {
        totalRows: rows.length,
        validIndian: validCount,
        filteredNonIndian: filteredOutCount,
        imported: newLeads.length,
      },
      message,
    };
  }
}
