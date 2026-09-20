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
import {
  CampaignNotFoundError,
  MaxActiveCampaignsReachedError,
} from "../../../campaigns/domain/errors/campaign.errors";
import {
  toBolnaISO,
  parseBolnaScheduledTime,
} from "../../../../shared/utils/bolna-date";

export class RunBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly planRepo: PlanRepository,
    private readonly checkBalanceForBatch?: CheckBalanceForBatchUseCase,
  ) {}

  async execute(tenantId: string, campaignId: string, batchId: string) {
    // 1. Validate batch
    const batchData = await this.batchRepo.findById(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batchData) throw new BatchNotFoundError();
    if (batchData.status !== "CREATED") {
      throw new BatchOperationError(
        `Cannot run batch in "${batchData.status}" status.`,
      );
    }
    if (!batchData.bolnaBatchId) throw new BatchNoBolnaIdError();

    // 2. Validate campaign
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) throw new CampaignNotFoundError();

    // 3. Enforce maxActiveCampaigns if this campaign is not already RUNNING
    if (campaign.status !== "RUNNING") {
      const activePlan = await this.planRepo.getActivePlanForTenant(tenantId);
      if (
        activePlan &&
        activePlan.maxActiveCampaigns !== null &&
        activePlan.maxActiveCampaigns !== undefined
      ) {
        const runningCount = await this.planRepo.countActiveCampaigns(tenantId);
        if (runningCount >= activePlan.maxActiveCampaigns) {
          throw new MaxActiveCampaignsReachedError(
            activePlan.maxActiveCampaigns,
          );
        }
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
    const now = new Date(Date.now());
    const scheduledAt = toBolnaISO(now);

    const bolnaResult = await this.bolnaProvider.scheduleBatch(
      tenantId,
      batchData.bolnaBatchId,
      scheduledAt,
    );

    const bolnaScheduledAt = parseBolnaScheduledTime(bolnaResult.state);

    // 6. Update batch and campaign status
    const updatedBatch = await this.batchRepo.update(batchId, {
      status: "RUNNING",
      scheduledAt: now,
      bolnaScheduledAt,
    });

    if (campaign.status === "DRAFT") {
      await this.campaignRepo.updateStatus(campaignId, "RUNNING", {
        startedAt: new Date(),
      });
    }

    const runsAt = new Date(bolnaScheduledAt ?? now).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return {
      batch: updatedBatch,
      message: `Batch processing started successfully at ${runsAt}`,
      ...(balanceWarning && { balanceWarning }),
    };
  }
}
