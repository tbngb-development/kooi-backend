import type { Logger } from "../../../../shared/logging/logger.interface";
import type { BatchProcessingWorker } from "./batch-processing.worker";
import prisma from "../../../../shared/config/database/prisma";
import { PrismaBatchRepository } from "../repositories/prisma-batch.repository"; // ◄ Added
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";

export class BatchProcessingScheduler {
  private readonly log: Logger | undefined;

  constructor(
    private readonly worker: BatchProcessingWorker,
    logger?: Logger,
  ) {
    this.log = logger?.child({ module: "BatchProcessingScheduler" });
  }

  start(): void {
    const queue = getQueue("batch-processing");

    // ── Run Stuck Batches Startup Cleanup ──────────────────────
    this.cleanupStuckProcessingBatches().catch((err) => {
      this.log?.error(
        "Failed to clean up stuck processing batches on boot",
        err,
      );
    });

    // ── Run Stuck Campaigns Startup Cleanup ───────────────────
    this.cleanupStuckRunningCampaigns().catch((err) => {
      this.log?.error(
        "Failed to clean up stuck running campaigns on boot",
        err,
      );
    });

    queue.process("process-batch", 2, async (job) => {
      await this.worker.process(job);
    });

    queue.on("completed", (job) => {
      this.log?.info("Queue job completed", {
        action: "batch.queue.completed",
        jobId: String(job.id),
        batchId: job.data.batchId,
        durationMs: job.finishedOn
          ? job.finishedOn - (job.processedOn ?? job.timestamp)
          : undefined,
      });
    });

    queue.on("failed", (job, err) => {
      this.log?.error("Queue job failed", err, {
        action: "batch.queue.failed",
        jobId: job?.id ? String(job.id) : undefined,
        batchId: job?.data?.batchId,
        attemptsMade: job?.attemptsMade,
        error: err.message,
      });
    });

    queue.on("stalled", (jobId) => {
      this.log?.warn("Queue job stalled (worker may have crashed)", {
        action: "batch.queue.stalled",
        jobId: String(jobId),
      });
    });

    this.log?.info("Batch processing scheduler started", {
      action: "batch.scheduler.start",
      concurrency: 2,
    });
  }

  private async cleanupStuckProcessingBatches(): Promise<void> {
    try {
      const stuckBatches = await prisma.leadBatch.findMany({
        where: { status: "PROCESSING" },
        select: { id: true, fileName: true, tenantId: true },
      });

      if (stuckBatches.length === 0) return;

      this.log?.warn(
        `Found ${stuckBatches.length} stuck processing batch(es) on boot, performing cleanup`,
        {
          action: "batch.cleanup.start",
          stuckCount: stuckBatches.length,
        },
      );

      const result = await prisma.leadBatch.updateMany({
        where: { status: "PROCESSING" },
        data: {
          status: "FAILED",
          processingStage: null,
          processingProgress: 0,
          processingError:
            "The server restarted while processing this file. Please delete this batch and upload your file again.",
        },
      });

      this.log?.info("Stuck processing batches successfully cleaned up", {
        action: "batch.cleanup.success",
        cleanedCount: result.count,
      });
    } catch (err) {
      this.log?.error("Database error during stuck batch startup cleanup", err);
    }
  }

  /**
   * Scans for running campaigns on boot and evaluates their status.
   * If all batches are terminal, it immediately closes the campaign.
   */
  private async cleanupStuckRunningCampaigns(): Promise<void> {
    try {
      const runningCampaigns = await prisma.campaign.findMany({
        where: { status: "RUNNING" },
        select: { id: true, name: true },
      });

      if (runningCampaigns.length === 0) return;

      this.log?.info(
        `Checking ${runningCampaigns.length} running campaign(s) for terminal states`,
        {
          action: "campaign.cleanup.start",
          runningCount: runningCampaigns.length,
        },
      );

      const batchRepo = new PrismaBatchRepository();

      for (const campaign of runningCampaigns) {
        // Calling this triggers our updated recalculateCampaignStats logic
        // which transitions campaign status cleanly to COMPLETED/FAILED
        await batchRepo.recalculateCampaignStats(campaign.id);
      }
    } catch (err) {
      this.log?.error(
        "Database error during running campaign startup cleanup",
        err,
      );
    }
  }

  async stop(): Promise<void> {
    const queue = getQueue("batch-processing");
    await queue.close();
    this.log?.info("Batch processing scheduler stopped", {
      action: "batch.scheduler.stop",
    });
  }
}
