import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  SarvamRecordingWorker,
  SarvamRecordingJobData,
} from "./sarvam-recording.worker";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";
import prisma from "../../../../shared/config/database/prisma";
import type { SarvamAttemptHistoryEntry } from "../../../webhooks/application/interfaces/sarvam-webhook-repository.interface";

export class SarvamRecordingScheduler {
  private isRunning = false;

  constructor(
    private readonly worker: SarvamRecordingWorker,
    private readonly logger?: Logger,
  ) {
    this.logger = logger?.child({ component: "SarvamRecordingScheduler" });
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const queue = getQueue("sarvam-recording-retrieval");

    queue.process("fetch-recording", 2, async (job) => {
      await this.worker.process(job);
    });

    queue.on("failed", async (job, err) => {
      const data = job.data as SarvamRecordingJobData;
      if (job.attemptsMade >= 5) {
        this.logger?.error(
          `Sarvam recording retrieval exhausted all 5 attempts for call ${data.callId}`,
          err,
          {
            action: "sarvam_recording.retries_exhausted",
            callId: data.callId,
            interactionId: data.interactionId,
            attemptsMade: job.attemptsMade,
          },
        );

        // Mark attempt as permanently FAILED in Call.callHistory
        try {
          const call = await prisma.call.findUnique({
            where: { id: data.callId },
            select: { id: true, callHistory: true },
          });

          if (call && Array.isArray(call.callHistory)) {
            const history = [
              ...(call.callHistory as unknown as SarvamAttemptHistoryEntry[]),
            ];
            const idx = history.findIndex(
              (a) =>
                a.interaction_id === data.interactionId ||
                a.attempt_id === data.attemptId,
            );
            if (idx >= 0) {
              history[idx] = {
                ...history[idx],
                recording_status: "FAILED",
                recording_error:
                  err?.message ?? "Recording retrieval retries exhausted",
              };
              await prisma.call.update({
                where: { id: call.id },
                data: { callHistory: history as any },
              });
            }
          }
        } catch (dbErr) {
          this.logger?.error(
            "Failed to mark recording as FAILED on retry exhaustion",
            dbErr,
          );
        }
      }
    });

    this.logger?.info("Sarvam recording retrieval queue worker started");
  }

  stop(): void {
    this.isRunning = false;
    this.logger?.info("Sarvam recording retrieval queue worker stopped");
  }
}
