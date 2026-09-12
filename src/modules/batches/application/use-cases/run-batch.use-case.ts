import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { BolnaBatchProvider } from "../../infrastructure/bolna-batch-provider.interface";
import type { CheckBalanceForBatchUseCase } from "../../../wallet/application/use-cases/check-balance-for-batch.use-case";
import {
  BatchNotFoundError,
  BatchOperationError,
  BatchNoBolnaIdError,
} from "../../domain/errors/batch.errors";
import {
  toBolnaISO,
  parseBolnaScheduledTime,
} from "../../../../shared/utils/bolna-date";

export class RunBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly checkBalanceForBatch?: CheckBalanceForBatchUseCase,
  ) {}

  async execute(tenantId: string, campaignId: string, batchId: string) {
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

    let balanceWarning: { balance: number; estimatedCost: number } | null =
      null;

    if (this.checkBalanceForBatch) {
      const check = await this.checkBalanceForBatch.execute({
        tenantId,
        leadCount: batchData.totalLeads,
      });
      // Hard block (< 50% estimate) throws InsufficientBalanceError inside use case
      if (check.warning) {
        balanceWarning = {
          balance: check.balance,
          estimatedCost: check.estimatedCost,
        };
      }
    }

    // const scheduledAt = new Date(Date.now() + 2 * 60 * 1000);
    const now = new Date(Date.now());
    const scheduledAt = toBolnaISO(now);

    const bolnaResult = await this.bolnaProvider.scheduleBatch(
      tenantId,
      batchData.bolnaBatchId,
      scheduledAt,
    );

    const bolnaScheduledAt = parseBolnaScheduledTime(bolnaResult.state);

    const updatedBatch = await this.batchRepo.update(batchId, {
      status: "RUNNING",
      scheduledAt: now,
      bolnaScheduledAt,
    });

    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (campaign && campaign.status === "DRAFT") {
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
