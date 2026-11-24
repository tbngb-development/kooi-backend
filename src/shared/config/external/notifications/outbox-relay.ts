import type { Logger } from "../../../logging/logger.interface";
import type { DiscordEvent } from "./discordevents-publisher";
import type { IDiscordOutboxRepository } from "./outbox-repository";

export interface DiscordEventSender {
  /** Must throw on transport failure so the relay can leave the row pending. */
  publishOrThrow(event: DiscordEvent): Promise<void>;
}

export interface DiscordOutboxRelayDeps {
  outbox: IDiscordOutboxRepository;
  sender: DiscordEventSender;
  logger: Logger;
  enabled: boolean;
  pollMs: number;
  batchSize: number;
}

/**
 * Polls pending envelopes and hands them to the HMAC-signing HTTP sender.
 * A failed delivery is left unpublished for a later tick; no attempt count
 * or status is persisted. Ticks never overlap.
 */
export class DiscordOutboxRelay {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;

  constructor(private readonly deps: DiscordOutboxRelayDeps) {}

  start(): void {
    if (!this.deps.enabled || this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.deps.logger.error("Discord outbox relay tick failed", error, {
          action: "notification.relay_tick_failed",
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

  async tick(): Promise<void> {
    if (!this.deps.enabled || this.inFlight) return;
    this.inFlight = true;

    try {
      const pending = await this.deps.outbox.findPending(this.deps.batchSize);
      for (const item of pending) {
        try {
          await this.deps.sender.publishOrThrow(item.event);
          await this.deps.outbox.markPublished(item.id);
          this.deps.logger.debug("Discord outbox event delivered", {
            action: "notification.relay_delivered",
            eventId: item.event.eventId,
          });
        } catch (error) {
          const responseData = (error as { response?: { data?: unknown; status?: number } })
            ?.response?.data;
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          this.deps.logger.error("Discord outbox delivery deferred", error, {
            action: "notification.relay_deferred",
            eventId: item.event.eventId,
            status,
            responseError:
              typeof responseData === "object" && responseData && "error" in responseData
                ? (responseData as { error: unknown }).error
                : responseData,
          });
        }
      }
    } finally {
      this.inFlight = false;
    }
  }
}
