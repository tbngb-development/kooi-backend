import type { Logger } from "../../../logging/logger.interface";
import type { IDiscordEventsPublisher, DiscordEvent } from "./discordevents-publisher";
import type { IDiscordOutboxRepository } from "./outbox-repository";

/**
 * Durable replacement for the direct HTTP publisher: the envelope is written
 * to the outbox and a separate relay delivers it. Failures are logged, never
 * propagated — Discord is an internal notification surface only.
 */
export class OutboxDiscordEventsPublisher implements IDiscordEventsPublisher {
  constructor(
    private readonly outbox: IDiscordOutboxRepository,
    private readonly logger: Logger,
    private readonly enabled: boolean,
  ) {}

  async publish(event: DiscordEvent): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.outbox.append(event);
      this.logger.debug("Discord event queued in outbox", {
        action: "notification.outbox_appended",
        eventId: event.eventId,
        eventType: event.eventType,
      });
    } catch (error) {
      this.logger.error("failed to append Discord event to outbox", error, {
        action: "notification.outbox_failed",
        eventId: event.eventId,
        eventType: event.eventType,
      });
    }
  }
}
