import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { BatchProcessingWorker } from "./batch-processing.worker";

export class BatchProcessingScheduler {
  constructor(
    private readonly worker: BatchProcessingWorker,
    private readonly logger?: Logger,
  ) {
  }

  start(): void {
    const queue = getQueue("batch-processing");

    queue.process("process-batch", 2, async (job) => {
      await this.worker.process(job);
    });

    queue.on("completed", (job) => {
      this.logger?.info("Queue job completed", {
        action: "batch.queue.completed",
        jobId: String(job.id), // <-- Cast JobId (string | number) to string
        batchId: job.data.batchId,
        durationMs: job.finishedOn
          ? job.finishedOn - (job.processedOn ?? job.timestamp)
          : undefined,
      });
    });

    queue.on("failed", (job, err) => {
      this.logger?.error("Queue job failed", err, {
        action: "batch.queue.failed",
        jobId: job?.id ? String(job.id) : undefined, // <-- Safe string conversion
        batchId: job?.data?.batchId,
        attemptsMade: job?.attemptsMade,
        error: err.message,
      });
    });

    queue.on("stalled", (jobId) => {
      this.logger?.warn("Queue job stalled (worker may have crashed)", {
        action: "batch.queue.stalled",
        jobId: String(jobId), // <-- Cast JobId to string
      });
    });

    this.logger?.info("Batch processing scheduler started", {
      action: "batch.scheduler.start",
      concurrency: 2,
    });
  }

  async stop(): Promise<void> {
    const queue = getQueue("batch-processing");
    await queue.close();
    this.logger?.info("Batch processing scheduler stopped", {
      action: "batch.scheduler.stop",
    });
  }
}
