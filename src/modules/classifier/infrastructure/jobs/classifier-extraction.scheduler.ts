import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import type { ClassifierExtractionWorker } from "./classifier-extraction.worker";
import type { Logger } from "../../../../shared/logging/logger.interface";

const QUEUE_NAME = "classifier-extraction";
const CONCURRENCY = 2; // 2-core VPS

export class ClassifierExtractionScheduler {
  private readonly queue = getQueue(QUEUE_NAME);
  private readonly log: Logger | undefined;

  constructor(
    private readonly worker: ClassifierExtractionWorker,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "ClassifierExtractionScheduler" });
  }

  start(): void {
    this.queue.process(CONCURRENCY, async (job) => this.worker.process(job));

    this.queue.on("completed", (job) => {
      this.log?.debug("Classifier job completed", {
        action: "classifier.queue.completed",
        jobId: job.id ? String(job.id) : undefined,
      });
    });

    this.queue.on("failed", (job, err) => {
      this.log?.error("Classifier job failed permanently", err, {
        action: "classifier.queue.failed",
        jobId: job.id ? String(job.id) : undefined,
      });
    });

    this.log?.info("Classifier extraction scheduler started", {
      concurrency: CONCURRENCY,
    });
  }

  stop(): void {
    this.queue.close();
    this.log?.info("Classifier extraction scheduler stopped");
  }

  getQueue() {
    return this.queue;
  }
}
