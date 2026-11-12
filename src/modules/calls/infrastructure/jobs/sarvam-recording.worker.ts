import type { Job } from "bull";
import type { FetchSarvamRecordingUseCase } from "../../application/use-cases/fetch-sarvam-recording.use-case";
import { SarvamRecordingPermanentError } from "../../domain/errors/sarvam-recording.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface SarvamRecordingJobData {
  callId: string;
  tenantId: string;
  attemptId: string;
  interactionId: string;
  source: "AUTOMATIC" | "MANUAL";
  adminUserId?: string;
}

export class SarvamRecordingWorker {
  constructor(
    private readonly fetchRecordingUseCase: FetchSarvamRecordingUseCase,
    private readonly logger?: Logger,
  ) {}

  async process(job: Job<SarvamRecordingJobData>): Promise<void> {
    const { callId, tenantId, attemptId, interactionId, source, adminUserId } =
      job.data;

    this.logger?.info("Processing Sarvam recording retrieval job", {
      action: "sarvam_recording.worker_process",
      jobId: String(job.id),
      attemptNumber: job.attemptsMade + 1,
      callId,
      interactionId,
      source,
    });

    try {
      await this.fetchRecordingUseCase.execute({
        callId,
        tenantId,
        attemptId,
        interactionId,
        source,
        adminUserId,
      });

      this.logger?.info("Sarvam recording retrieval job finished successfully", {
        action: "sarvam_recording.worker_success",
        jobId: String(job.id),
        callId,
        interactionId,
      });
    } catch (err: unknown) {
      if (err instanceof SarvamRecordingPermanentError) {
        this.logger?.error(
          "Permanent failure in Sarvam recording retrieval job, discarding",
          err,
          {
            action: "sarvam_recording.worker_permanent_failure",
            jobId: String(job.id),
            callId,
            interactionId,
            statusCode: err.statusCode,
          },
        );
        // Do not retry permanent errors
        job.discard();
        return;
      }

      this.logger?.warn("Sarvam recording retrieval job failed, will retry if attempts remain", {
        action: "sarvam_recording.worker_retryable_failure",
        jobId: String(job.id),
        attemptsMade: job.attemptsMade,
        callId,
        interactionId,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  }
}

