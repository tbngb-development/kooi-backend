import type { Job } from "bull";
import type { ProcessClassifierExtractionUseCase } from "../../application/use-cases/process-classifier-extraction.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { ClassifierJobData } from "../../application/dto/classifier.dto";

export class ClassifierExtractionWorker {
  private readonly log: Logger | undefined;

  constructor(
    private readonly processUseCase: ProcessClassifierExtractionUseCase,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "ClassifierExtractionWorker" });
  }

  async process(job: Job<ClassifierJobData>): Promise<void> {
    const { callId, tenantId } = job.data;

    this.log?.info("Processing classifier extraction", {
      action: "classifier.worker.start",
      callId,
      tenantId,
      attempt: job.attemptsMade + 1,
    });

    try {
      await this.processUseCase.execute(callId, tenantId);
    } catch (err) {
      const maxAttempts = job.opts.attempts ?? 3;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

      this.log?.error("Classifier extraction job failed", err, {
        action: "classifier.worker.error",
        callId,
        tenantId,
        attempt: job.attemptsMade + 1,
        maxAttempts,
        isFinalAttempt,
      });

      throw err; // Re-throw for Bull retry
    }
  }
}
