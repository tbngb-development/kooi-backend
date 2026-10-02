import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { BolnaBatchProvider } from "../interfaces/bolna-batch-provider.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { CampaignNotFoundError } from "../../../campaigns/domain/errors/campaign.errors";
import { BatchNotFoundError } from "../../domain/errors/batch.errors";

export interface StopBatchResult {
  batchId: string;
  status: string;
  message: string;
  bolnaStopped: boolean;
}

/**
 * Halts executing campaigns and sets the batch state to STOPPED.
 *
 * Resiliency:
 *  If Bolna's API returns a 404, a network timeout, or any error
 *  (indicating Bolna has already deleted or completed the batch),
 *  the use case catches the error and STILL updates the local DB status
 *  to STOPPED (Force-Stop). This guarantees batches can never get stuck.
 */
export class StopBatchUseCase {
  private readonly log: Logger | undefined;

  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "StopBatchUseCase" });
  }

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<StopBatchResult> {
    // 1. Verify campaign exists
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) throw new CampaignNotFoundError();

    // 2. Verify batch exists
    const batch = await this.batchRepo.findById(tenantId, campaignId, batchId);
    if (!batch) throw new BatchNotFoundError();

    // If already stopped or terminal, exit early with success
    if (
      batch.status === "STOPPED" ||
      batch.status === "COMPLETED" ||
      batch.status === "FAILED"
    ) {
      return {
        batchId,
        status: batch.status,
        message: "This batch is already inactive.",
        bolnaStopped: false,
      };
    }

    let bolnaStopped = false;

    // 3. Attempt to stop the batch at Bolna
    if (batch.bolnaBatchId) {
      try {
        this.log?.info("Sending stop request to Bolna API", {
          action: "batch.stop.bolna_request",
          batchId,
          bolnaBatchId: batch.bolnaBatchId,
        });

        await this.bolnaProvider.stopBatch(tenantId, batch.bolnaBatchId);
        bolnaStopped = true;
      } catch (err) {
        // ◄ GRACEFUL FALLBACK (Force Stop)
        const errorMessage = err instanceof Error ? err.message : String(err);

        this.log?.warn(
          "Bolna stop request failed, falling back to local force-stop",
          {
            action: "batch.stop.bolna_failed_fallback",
            batchId,
            bolnaBatchId: batch.bolnaBatchId,
            error: errorMessage,
          },
        );
      }
    }

    // 4. Update the local state to STOPPED (always runs, even if Bolna failed!)
    await this.batchRepo.update(batchId, {
      status: "STOPPED",
    });

    // 5. Mark all never-dialed (PENDING) leads in this batch as STOPPED
    //    so they are not dialed if the campaign resumes other batches
    try {
      const stoppedLeadsCount = await this.batchRepo.markPendingLeadsAsStopped(
        batchId,
        "MANUAL",
      );
      this.log?.info("Pending leads marked as stopped", {
        action: "batch.stop.leads_stopped",
        batchId,
        count: stoppedLeadsCount,
      });
    } catch (err) {
      this.log?.error("Failed to mark pending leads as stopped", err, {
        batchId,
      });
    }

    // 6. Recalculate campaign stats
    try {
      await this.batchRepo.recalculateCampaignStats(campaignId);
    } catch (err) {
      this.log?.error("Failed to recalculate campaign stats after stop", err, {
        campaignId,
      });
    }

    return {
      batchId,
      status: "STOPPED",
      message: bolnaStopped
        ? "Batch stopped successfully."
        : "Batch force-stopped locally (calling service was already offline).",
      bolnaStopped,
    };
  }
}
