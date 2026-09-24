import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import {
  BatchNotFoundError,
  BatchOperationError,
} from "../../domain/errors/batch.errors";
import { isBatchTerminal } from "../../domain/entities/batch-status.rules";
import { type BolnaBatchProvider } from "../interfaces/bolna-batch-provider.interface";

export class StopBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
  ) {}

  async execute(tenantId: string, campaignId: string, batchId: string) {
    const batchData = await this.batchRepo.findById(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batchData) throw new BatchNotFoundError();

    if (batchData.status !== "SCHEDULED" && batchData.status !== "RUNNING") {
      throw new BatchOperationError(
        `Cannot stop batch in "${batchData.status}" status.`,
      );
    }

    // 1. Tell Bolna to stop processing the queue
    if (batchData.bolnaBatchId) {
      try {
        await this.bolnaProvider.stopBatch(tenantId, batchData.bolnaBatchId);
      } catch (err) {
        console.warn("[StopBatch] Bolna stop error:", err);
      }
    }

    // 2. Mark the batch as STOPPED
    const updatedBatch = await this.batchRepo.update(batchId, {
      status: "STOPPED",
    });

    // 3. Mark all never-dialed leads in this batch as STOPPED
    await this.batchRepo.markPendingLeadsAsStopped(batchId, "MANUAL");

    // 4. Recalculate campaign status
    await this.checkAndUpdateCampaignStatus(campaignId);

    return {
      batch: updatedBatch,
      message:
        "Batch stopped successfully. Remaining queued leads marked as STOPPED. In-flight calls will settle naturally.",
    };
  }

  private async checkAndUpdateCampaignStatus(
    campaignId: string,
  ): Promise<void> {
    const statuses = await this.batchRepo.getAllBatchStatuses(campaignId);
    if (statuses.length === 0) return;

    const allTerminal = statuses.every(isBatchTerminal);
    const anyActive = statuses.some(
      (s) => s === "RUNNING" || s === "SCHEDULED",
    );

    if (allTerminal) {
      const allFailed = statuses.every((s) => s === "FAILED");
      await this.campaignRepo.updateStatus(
        campaignId,
        allFailed ? "FAILED" : "COMPLETED",
        { completedAt: new Date() },
      );
    } else if (!anyActive) {
      await this.campaignRepo.updateStatus(campaignId, "DRAFT");
    }
  }
}
