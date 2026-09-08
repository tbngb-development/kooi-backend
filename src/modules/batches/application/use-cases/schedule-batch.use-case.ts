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

export class ScheduleBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly checkBalanceForBatch?: CheckBalanceForBatchUseCase,
  ) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
    scheduledAt: string,
  ) {
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

    const isoString = toBolnaISO(targetDate);
    const bolnaResult = await this.bolnaProvider.scheduleBatch(
      tenantId,
      batchData.bolnaBatchId,
      isoString,
    );
    const bolnaScheduledAt = parseBolnaScheduledTime(bolnaResult.state);

    const updatedBatch = await this.batchRepo.update(batchId, {
      status: "SCHEDULED",
      scheduledAt: targetDate,
      bolnaScheduledAt,
    });

    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (campaign && campaign.status === "DRAFT") {
      await this.campaignRepo.updateStatus(campaignId, "RUNNING", {
        startedAt: new Date(),
      });
    }

    return {
      batch: updatedBatch,
      message: `Batch scheduled for ${bolnaScheduledAt ?? isoString}`,
      ...(balanceWarning && { balanceWarning }),
    };
  }
}
