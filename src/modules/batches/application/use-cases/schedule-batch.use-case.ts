import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { BolnaBatchProvider } from "../../infrastructure/bolna-batch-provider.interface";
import type { CheckBalanceForBatchUseCase } from "../../../wallet/application/use-cases/check-balance-for-batch.use-case";
import {
  BatchNotFoundError,
  BatchOperationError,
  BatchNoBolnaIdError,
} from "../../domain/errors/batch.errors";
import { CampaignNotFoundError } from "../../../campaigns/domain/errors/campaign.errors";
import {
  toBolnaISO,
  parseBolnaScheduledTime,
} from "../../../../shared/utils/bolna-date";
import { ScheduledCampaignConflictError } from "../../../plans/domain/errors/plan.errors";

export class ScheduleBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly planRepo: PlanRepository,
    private readonly checkBalanceForBatch?: CheckBalanceForBatchUseCase,
  ) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
    scheduledAt: string,
  ) {
    // 1. Validate batch
    const batchData = await this.batchRepo.findById(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batchData) throw new BatchNotFoundError();
    if (batchData.status !== "CREATED") {
      throw new BatchOperationError(
        `Cannot schedule batch in "${batchData.status}" status.`,
      );
    }
    if (!batchData.bolnaBatchId) throw new BatchNoBolnaIdError();

    const targetDate = new Date(scheduledAt);
    if (isNaN(targetDate.getTime())) {
      throw new BatchOperationError("Invalid date format.");
    }

    if (targetDate.getTime() < Date.now()) {
      throw new BatchOperationError("Scheduled time must be in the future.");
    }

    // 2. Validate campaign
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) throw new CampaignNotFoundError();

    // 3. Enforce maxActiveCampaigns with Time-Window Overlap Guard
    const activePlan = await this.planRepo.getActivePlanForTenant(tenantId);
    if (
      activePlan &&
      activePlan.maxActiveCampaigns !== null &&
      activePlan.maxActiveCampaigns !== undefined
    ) {
      // Check if other campaigns are scheduled/running in this time window
      const concurrentCount =
        await this.planRepo.countConcurrentCampaignsAtTime(
          tenantId,
          targetDate,
          campaignId, // Exclude this campaign (scheduling 2 batches in SAME campaign is fine)
        );

      if (concurrentCount >= activePlan.maxActiveCampaigns) {
        const formattedTime = targetDate.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        throw new ScheduledCampaignConflictError(
          formattedTime,
          activePlan.maxActiveCampaigns,
        );
      }
    }

    // 4. Check balance
    let balanceWarning: { balance: number; estimatedCost: number } | null =
      null;
    if (this.checkBalanceForBatch) {
      const check = await this.checkBalanceForBatch.execute({
        tenantId,
        leadCount: batchData.totalLeads,
      });
      if (check.warning) {
        balanceWarning = {
          balance: check.balance,
          estimatedCost: check.estimatedCost,
        };
      }
    }

    // 5. Schedule at Bolna
    const isoString = toBolnaISO(targetDate);
    const bolnaResult = await this.bolnaProvider.scheduleBatch(
      tenantId,
      batchData.bolnaBatchId,
      isoString,
    );
    const bolnaScheduledAt = parseBolnaScheduledTime(bolnaResult.state);

    // 6. Update batch and campaign status
    const updatedBatch = await this.batchRepo.update(batchId, {
      status: "SCHEDULED",
      scheduledAt: targetDate,
      bolnaScheduledAt,
    });

    if (campaign.status === "DRAFT") {
      await this.campaignRepo.updateStatus(campaignId, "RUNNING", {
        startedAt: new Date(),
      });
    }

    const finalDate = bolnaScheduledAt
      ? new Date(bolnaScheduledAt)
      : targetDate;

    // 2. Format explicitly in IST (Asia/Kolkata)
    const scheduledFormattedTime = finalDate.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    return {
      batch: updatedBatch,
      message: `Batch scheduled successfully for ${scheduledFormattedTime}`,
      ...(balanceWarning && { balanceWarning }),
    };
  }
}
