import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HttpDiscordEventsPublisher,
  type IDiscordEventsPublisher,
  type DiscordEvent,
} from "../discordevents-publisher";
import type { Logger } from "../../../../logging/logger.interface";

const event: DiscordEvent = {
  eventId: "payment.completed:rec_1:success",
  eventType: "payment.completed",
  eventVersion: 1,
  occurredAt: "2026-11-17T10:00:00.000Z",
  tenantId: "tenant-1",
  source: "kooi-backend",
  data: { rechargeId: "rec_1", amountPaisa: 49900 },
};

describe("HttpDiscordEventsPublisher", () => {
  let post: ReturnType<typeof vi.fn>;
  let logger: Logger;
  let makePublisher: (
    overrides?: Record<string, unknown>,
  ) => HttpDiscordEventsPublisher;

  beforeEach(() => {
    post = vi.fn().mockResolvedValue({ status: 202 });
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    makePublisher = (overrides = {}) =>
      new HttpDiscordEventsPublisher(
        {
          serviceUrl: "http://localhost:3005",
          webhookSecret: "shared-secret",
          timeoutMs: 3000,
          enabled: true,
          ...overrides,
        },
        logger,
        { post } as never,
      );
  });

  it("signs the exact raw bytes with a timestamp and posts to the events endpoint", async () => {
    await makePublisher().publish(event);

    expect(post).toHaveBeenCalledTimes(1);
    const [url, raw, config] = post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string>; timeout: number },
    ];

    expect(url).toBe("http://localhost:3005/api/v1/events");
    expect(raw).toBe(JSON.stringify(event));
    expect(config.headers["content-type"]).toBe("application/json");
    expect(config.timeout).toBe(3000);

    const timestamp = config.headers["x-kooi-timestamp"];
    expect(timestamp).toMatch(/^\d+$/);
    const expected = createHmac("sha256", "shared-secret")
      .update(`${timestamp}.`)
      .update(Buffer.from(raw, "utf8"))
      .digest("hex");
    expect(config.headers["x-kooi-signature"]).toBe(expected);
  });

  it("does not throw and logs when the notification service is unavailable", async () => {
    post.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(makePublisher().publish(event)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "failed to publish KOOI event",
      expect.anything(),
      expect.objectContaining({
        action: "notification.publish_failed",
        eventId: event.eventId,
      }),
    );
  });

  it("publishOrThrow surfaces transport failures to the outbox relay", async () => {
    post.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(makePublisher().publishOrThrow(event)).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  it("does not throw and logs on a non-2xx response", async () => {
    post.mockRejectedValueOnce(new Error("Request failed with status code 500"));

    await expect(makePublisher().publish(event)).resolves.toBeUndefined();
  });

  it("surfaces a 429 response to the outbox relay for retry", async () => {
    post.mockResolvedValueOnce({ status: 429 });

    await expect(makePublisher().publishOrThrow(event)).rejects.toThrow(
      "notification service returned 429",
    );
  });

  it("is a no-op when disabled", async () => {
    await makePublisher({ enabled: false }).publish(event);
    expect(post).not.toHaveBeenCalled();
  });

  it("is a no-op when the shared secret is empty", async () => {
    await makePublisher({ webhookSecret: "" }).publish(event);
    expect(post).not.toHaveBeenCalled();
  });

  it("never logs the shared secret or the raw payload", async () => {
    post.mockRejectedValueOnce(new Error("boom"));
    await makePublisher().publish(event);

    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain("shared-secret");
    expect(logged).not.toContain(JSON.stringify(event));
  });
});
