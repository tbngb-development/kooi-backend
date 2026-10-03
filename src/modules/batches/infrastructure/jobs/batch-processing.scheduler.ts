import type { Logger } from "../../../../shared/logging/logger.interface";
import type { BatchProcessingWorker } from "./batch-processing.worker";
import prisma from "../../../../shared/config/database/prisma";
import { PrismaBatchRepository } from "../repositories/prisma-batch.repository";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";

export class BatchProcessingScheduler {
  private autoRecoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly worker: BatchProcessingWorker,
    private readonly logger?: Logger,
  ) {
    this.logger = logger?.child({ component: "BatchProcessingScheduler" });
  }

  start(): void {
    const queue = getQueue("batch-processing");

    // 1. Run Boot-Time Cleanups
    this.cleanupStuckProcessingBatches().catch((err) => {
      if (this.logger)
        this.logger.error("Failed cleanup of stuck batches on boot", err);
    });

    this.cleanupStuckRunningCampaigns().catch((err) => {
      if (this.logger)
        this.logger.error("Failed cleanup of running campaigns on boot", err);
    });

    // 2. Start Periodic Runtime Auto-Recovery (Every 2 minutes)
    this.autoRecoveryTimer = setInterval(() => {
      this.autoRecoverTimedOutBatches().catch((err) => {
        if (this.logger) this.logger.error("Runtime auto-recovery error", err);
      });
    }, 120_000); // 2 minutes

    // 3. Register Worker Processor
    queue.process("process-batch", 2, async (job) => {
      await this.worker.process(job);
    });

    queue.on("completed", (job) => {
      const msg = `Queue job completed: ${job.id} (batch: ${job.data.batchId})`;
      if (this.logger) {
        this.logger.info(msg, {
          action: "batch.queue.completed",
          jobId: String(job.id),
          batchId: job.data.batchId,
        });
      } else {
        console.log(`[BatchQueue] ${msg}`);
      }
    });

    queue.on("failed", (job, err) => {
      const msg = `Queue job failed: ${job?.id}: ${err.message}`;
      if (this.logger) {
        this.logger.error(msg, err, {
          action: "batch.queue.failed",
          jobId: job?.id ? String(job.id) : undefined,
        });
      } else {
        console.error(`[BatchQueue] ${msg}`);
      }
    });

    queue.on("stalled", (jobId) => {
      const msg = `Queue job stalled (re-assigning): ${jobId}`;
      if (this.logger) {
        this.logger.warn(msg, {
          action: "batch.queue.stalled",
          jobId: String(jobId),
        });
      } else {
        console.warn(`[BatchQueue] ${msg}`);
      }
    });

    if (this.logger) {
      this.logger.info("Batch processing scheduler started", {
        action: "batch.scheduler.start",
        concurrency: 2,
      });
    } else {
      console.log("[BatchScheduler] Scheduler started (concurrency: 2)");
    }
  }

  /**
   * Scans for any batch stuck in PROCESSING for > 5 minutes during runtime
   * and automatically transitions it to FAILED so the UI unlocks.
   */
  private async autoRecoverTimedOutBatches(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const timedOut = await prisma.leadBatch.findMany({
      where: {
        status: "PROCESSING",
        createdAt: { lte: fiveMinutesAgo },
      },
      select: { id: true, campaignId: true },
    });

    if (timedOut.length === 0) return;

    this.logger?.warn(
      `Auto-recovering ${timedOut.length} timed-out processing batch(es)`,
      {
        action: "batch.auto_recovery",
        count: timedOut.length,
      },
    );

    await prisma.leadBatch.updateMany({
      where: {
        status: "PROCESSING",
        createdAt: { lte: fiveMinutesAgo },
      },
      data: {
        status: "FAILED",
        processingStage: null,
        processingProgress: 0,
        processingError:
          "Processing timed out. Please delete this batch and upload again.",
      },
    });

    const batchRepo = new PrismaBatchRepository();
    for (const b of timedOut) {
      await batchRepo.recalculateCampaignStats(b.campaignId);
    }
  }

  private async cleanupStuckProcessingBatches(): Promise<void> {
    try {
      const stuckBatches = await prisma.leadBatch.findMany({
        where: { status: "PROCESSING" },
        select: { id: true },
      });

      if (stuckBatches.length === 0) return;

      await prisma.leadBatch.updateMany({
        where: { status: "PROCESSING" },
        data: {
          status: "FAILED",
          processingStage: null,
          processingProgress: 0,
          processingError:
            "The server restarted while processing this file. Please delete this batch and upload again.",
        },
      });

      if (this.logger)
        this.logger.info(
          `Cleaned up ${stuckBatches.length} stuck processing batches on startup.`,
        );
    } catch (err) {
      if (this.logger)
        this.logger.error("Database error during stuck batch cleanup", err);
    }
  }

  private async cleanupStuckRunningCampaigns(): Promise<void> {
    try {
      const runningCampaigns = await prisma.campaign.findMany({
        where: { status: "RUNNING" },
        select: { id: true },
      });

      if (runningCampaigns.length === 0) return;

      const batchRepo = new PrismaBatchRepository();
      for (const campaign of runningCampaigns) {
        await batchRepo.recalculateCampaignStats(campaign.id);
      }
    } catch (err) {
      if (this.logger)
        this.logger.error("Database error during campaign cleanup", err);
    }
  }

  async stop(): Promise<void> {
    if (this.autoRecoveryTimer) {
      clearInterval(this.autoRecoveryTimer);
      this.autoRecoveryTimer = null;
    }
    const queue = getQueue("batch-processing");
    await queue.close();
  }
}
