import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import type {
  InboundNumberSyncWorker,
  InboundNumberSyncJobData,
} from "./inbound-number-sync.worker";
import type { Logger } from "../../../../shared/logging/logger.interface";

export const INBOUND_SYNC_QUEUE_NAME = "inbound-number-sync";
const CONCURRENCY = 2;

export class InboundNumberSyncScheduler {
  private readonly queue = getQueue(INBOUND_SYNC_QUEUE_NAME);
  private readonly log: Logger | undefined;

  constructor(
    private readonly worker: InboundNumberSyncWorker,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "InboundNumberSyncScheduler" });
  }

  start(): void {
    this.queue.process(CONCURRENCY, async (job) => this.worker.process(job));

    this.queue.on("completed", (job) => {
      this.log?.debug("Inbound number sync job completed", {
        action: "inbound_number.queue.completed",
        jobId: job.id ? String(job.id) : undefined,
      });
    });

    this.queue.on("failed", (job, err) => {
      this.log?.error("Inbound number sync job failed permanently", err, {
        action: "inbound_number.queue.failed",
        jobId: job.id ? String(job.id) : undefined,
      });
    });

    this.log?.info("Inbound number sync scheduler started", {
      concurrency: CONCURRENCY,
    });
  }

  async enqueue(data: InboundNumberSyncJobData): Promise<void> {
    await this.queue.add(data, {
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 5_000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
  }

  stop(): void {
    this.queue.close();
    this.log?.info("Inbound number sync scheduler stopped");
  }

  getQueue() {
    return this.queue;
  }
}
