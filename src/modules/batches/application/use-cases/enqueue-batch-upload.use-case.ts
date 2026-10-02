import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../../shared/config/external/storage/file-storage.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { CreateBatchInput } from "../dto/batch.dto";
import {
  CampaignNotFoundError,
  CampaignFailedError,
  MaxActiveCampaignsReachedError,
} from "../../../campaigns/domain/errors/campaign.errors";
import {
  EmptyFileError,
  BatchOperationError,
} from "../../domain/errors/batch.errors";
import {
  ScheduledCampaignConflictError,
  TenantPlanNotFoundError,
} from "../../../plans/domain/errors/plan.errors";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";

export interface EnqueueBatchResult {
  batchId: string;
  status: string;
  message: string;
}

export class EnqueueBatchUploadUseCase {
  private readonly log: Logger | undefined;

  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly planRepo: PlanRepository,
    private readonly storage: FileStorageProvider,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "EnqueueBatchUpload" });
  }

  async execute(input: CreateBatchInput): Promise<EnqueueBatchResult> {
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

    // 2. Validate active plan
    const activePlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!activePlan) throw new TenantPlanNotFoundError(input.tenantId);

    // 3. Validate file
    if (!input.fileBuffer || input.fileBuffer.length === 0) {
      throw new EmptyFileError();
    }

    // 4. Fast-fail plan cap checks
    // eslint-disable-next-line no-useless-assignment
    let targetScheduledDate: Date | null = null;

    if (input.scheduledAt) {
      targetScheduledDate = new Date(input.scheduledAt);
      if (isNaN(targetScheduledDate.getTime())) {
        throw new BatchOperationError(
          "The scheduled date and time format is invalid. Please select a valid future date.",
        );
      }
      if (targetScheduledDate.getTime() < Date.now()) {
        throw new BatchOperationError(
          "The scheduled time must be in the future. Please select a later time.",
        );
      }
      if (
        activePlan.maxActiveCampaigns !== null &&
        activePlan.maxActiveCampaigns !== undefined
      ) {
        const conflictCount =
          await this.planRepo.countConcurrentCampaignsAtTime(
            input.tenantId,
            targetScheduledDate,
            input.campaignId,
          );
        if (conflictCount >= activePlan.maxActiveCampaigns) {
          const formattedTime = targetScheduledDate.toLocaleTimeString(
            "en-IN",
            { hour: "2-digit", minute: "2-digit" },
          );
          throw new ScheduledCampaignConflictError(
            formattedTime,
            activePlan.maxActiveCampaigns,
          );
        }
      }
    } else if (input.runImmediately) {
      if (
        campaign.status !== "RUNNING" &&
        activePlan.maxActiveCampaigns !== null &&
        activePlan.maxActiveCampaigns !== undefined
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

    // 5. Per-tenant concurrency guard
    const queue = getQueue("batch-processing");
    const activeJobs = await queue.getJobs(["active", "waiting"]);
    const tenantJobCount = activeJobs.filter(
      (j) => j.data.tenantId === input.tenantId,
    ).length;

    if (tenantJobCount >= 2) {
      throw new BatchOperationError(
        "You already have 2 uploads in progress. Please wait for them to finish before uploading another file.",
      );
    }

    // 6. Upload raw CSV to Cloudinary
    const rawFileUrl = await this.storage.uploadBuffer(
      input.fileBuffer,
      `raw-${input.fileName}`,
      `kooi/${input.tenantId}/campaigns/${input.campaignId}/batches/raw`,
    );

    // 7. Create batch record with PROCESSING status
    const batch = await this.batchRepo.create({
      campaignId: input.campaignId,
      tenantId: input.tenantId,
      fileName: input.fileName,
      totalLeads: 0,
      retryConfig: input.retryConfig,
      termsAccepted: input.termsAccepted,
      termsAcceptedAt: new Date(),
      termsVersion: input.termsVersion,
    });

    // Set status to PROCESSING and store raw file URL
    await this.batchRepo.update(batch.id, {
      status: "PROCESSING",
    });
    await this.batchRepo.updateRawFileUrl(batch.id, rawFileUrl);

    // 8. Enqueue the heavy processing job
    await queue.add(
      "process-batch",
      {
        batchId: batch.id,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        rawFileUrl,
        fileName: input.fileName,
        scheduledAt: input.scheduledAt ?? null,
        runImmediately: input.runImmediately ?? false,
        retryConfig: input.retryConfig ?? null,
        termsVersion: input.termsVersion,
      },
      {
        jobId: `batch:${batch.id}`,
        priority: 1,
      },
    );

    this.log?.info("Batch enqueued for processing", {
      action: "batch.enqueue",
      batchId: batch.id,
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      fileName: input.fileName,
      fileSizeBytes: input.fileBuffer.length,
    });

    return {
      batchId: batch.id,
      status: "PROCESSING",
      message:
        "Your file is being processed. You'll see the leads appear shortly.",
    };
  }
}
