import { createHmac } from "node:crypto";
import axios from "axios";
import type { Logger } from "../../../logging/logger.interface";

/**
 * Backend -> Discord notification service envelope. Kept transport-agnostic so
 * future outbox/relay code can persist the same shape without changes.
 */
export interface DiscordEvent {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  tenantId: string;
  source: string;
  actorId?: string;
  data: Record<string, unknown>;
}

export interface IDiscordEventsPublisher {
  publish(event: DiscordEvent): Promise<void>;
}

/** Used when a module is constructed without a publisher (e.g. unit tests). */
export const noopDiscordEventsPublisher: IDiscordEventsPublisher = {
  publish: async () => {},
};

export interface DiscordEventsPublisherOptions {
  serviceUrl: string;
  /** Must equal the notification service's KOOI_WEBHOOK_SECRET. */
  webhookSecret: string;
  timeoutMs: number;
  enabled: boolean;
}

/** Small seam so tests can replace the HTTP client without network calls. */
export interface DiscordEventsHttpClient {
  post(
    url: string,
    data: string,
    config: { headers: Record<string, string>; timeout: number },
  ): Promise<unknown>;
}

/**
 * Signs and POSTs operational events to the separate Discord notification
 * service. Delivery is best-effort by design: a notification outage must never
 * fail the KOOI business operation that produced the event.
 */
export class HttpDiscordEventsPublisher implements IDiscordEventsPublisher {
  constructor(
    private readonly options: DiscordEventsPublisherOptions,
    private readonly logger: Logger,
    private readonly http: DiscordEventsHttpClient = axios as unknown as DiscordEventsHttpClient,
  ) {}

  async publish(event: DiscordEvent): Promise<void> {
    if (!this.options.enabled || !this.options.webhookSecret) {
      this.logger.debug("KOOI event publishing disabled", {
        action: "notification.publish_skipped",
        eventId: event.eventId,
      });
      return;
    }

    try {
      const timestamp = String(Date.now());
      const raw = JSON.stringify(event);
      const signature = createHmac("sha256", this.options.webhookSecret)
        .update(`${timestamp}.`)
        .update(Buffer.from(raw, "utf8"))
        .digest("hex");

      const url = `${this.options.serviceUrl.replace(/\/$/, "")}/api/v1/events`;
      const response = await this.http.post(url, raw, {
        headers: {
          "content-type": "application/json",
          "x-kooi-timestamp": timestamp,
          "x-kooi-signature": signature,
        },
        timeout: this.options.timeoutMs,
      });

      if (
        response &&
        typeof response === "object" &&
        "status" in response &&
        ((response as { status: number }).status < 200 ||
          (response as { status: number }).status >= 300)
      ) {
        throw new Error(
          `notification service returned ${(response as { status: number }).status}`,
        );
      }

      this.logger.debug("KOOI event published", {
        action: "notification.published",
        eventId: event.eventId,
        eventType: event.eventType,
      });
    } catch (error) {
      // Never propagate: Discord is an internal notification surface only.
      // Log context deliberately excludes the secret and the raw payload.
      this.logger.error("failed to publish KOOI event", error, {
        action: "notification.publish_failed",
        eventId: event.eventId,
        eventType: event.eventType,
      });
    }
  }
}
