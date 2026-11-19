import type { Logger } from "../../../logging/logger.interface";
import { EmailProviderError } from "./email.errors";
import type { IIdempotentEmailSender } from "./email.interface";
import type { EmailFailure, IEmailOutboxRepository } from "./outbox-repository.types";

/** Provider rejections that can never succeed on retry — straight to DLQ. */
const NON_RETRYABLE_CODES = new Set([
  "invalid_idempotent_request",
  "invalid_idempotency_key",
  "validation_error",
  "missing_required_field",
  "invalid_from_address",
]);

export interface EmailOutboxRelayDeps {
  outbox: IEmailOutboxRepository;
  sender: IIdempotentEmailSender;
  logger: Logger;
  enabled: boolean;
  pollMs: number;
  batchSize: number;
  maxAttempts: number;
  baseBackoffMs: number;
}

function classify(error: unknown): EmailFailure {
  if (error instanceof EmailProviderError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Drains due outbox envelopes. Rows are atomically claimed so multiple app
 * instances cannot double-send. Provider failures are recorded and retried
 * with exponential backoff, or parked in the DLQ; they never escape a tick.
 */
export class EmailOutboxRelay {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;

  constructor(private readonly deps: EmailOutboxRelayDeps) {}

  start(): void {
    if (!this.deps.enabled || this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.deps.logger.error("Email outbox relay tick failed", error, {
          action: "email.outbox.tick_failed",
        });
      });
    }, this.deps.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (!this.deps.enabled || this.inFlight) return;
    this.inFlight = true;

    try {
      const pending = await this.deps.outbox.findDue(this.deps.batchSize, now);
      for (const item of pending) {
        let claimed = false;
        try {
          claimed = await this.deps.outbox.claim(item.id, now);
        } catch (error) {
          this.deps.logger.error("Email outbox claim failed", error, {
            action: "email.outbox.claim_failed",
            id: item.id,
          });
          continue;
        }
        if (!claimed) continue;

        try {
          const result = await this.deps.sender.send(
            {
              to: item.toEmail,
              subject: item.subject,
              html: item.html,
            },
            item.idempotencyKey,
          );
          await this.deps.outbox.markSent(item.id, result.messageId);
          this.deps.logger.debug("Email outbox envelope delivered", {
            action: "email.outbox.delivered",
            id: item.id,
            idempotencyKey: item.idempotencyKey,
          });
        } catch (error) {
          await this.recordFailure(item.id, item.attempts + 1, classify(error), now);
        }
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async recordFailure(
    id: string,
    attemptsMade: number,
    failure: EmailFailure,
    now: Date,
  ): Promise<void> {
    const dead =
      NON_RETRYABLE_CODES.has(failure.code) ||
      attemptsMade >= this.deps.maxAttempts;

    try {
      if (dead) {
        await this.deps.outbox.moveToDeadLetter(id, failure);
      } else {
        const backoffMs =
          this.deps.baseBackoffMs * 2 ** (attemptsMade - 1);
        await this.deps.outbox.scheduleRetry(
          id,
          failure,
          new Date(now.getTime() + backoffMs),
        );
      }
    } catch (error) {
      this.deps.logger.error("Email outbox failure recording failed", error, {
        action: "email.outbox.failure_record_failed",
        id,
      });
    }

    this.deps.logger.error("Email outbox delivery failed", failure.message, {
      action: dead ? "email.outbox.dead_letter" : "email.outbox.retry_scheduled",
      id,
      code: failure.code,
      attemptsMade,
    });
  }
}
