import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailOutboxRelay } from "../outbox-relay";
import { EmailProviderError } from "../email.errors";
import type {
  EmailFailure,
  IEmailOutboxRepository,
  PendingEmail,
} from "../outbox-repository";
import type { IIdempotentEmailSender } from "../email.interface";
import type { Logger } from "../../../../logging/logger.interface";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const now = new Date("2026-01-01T00:00:00Z");

const item: PendingEmail = {
  id: "outbox-1",
  idempotencyKey: "enforce:incident-1",
  toEmail: "owner@example.com",
  subject: "KOOI — wallet blocked",
  html: "<p>blocked</p>",
  attempts: 0,
};

function makeOutbox(
  overrides: Partial<IEmailOutboxRepository> = {},
): IEmailOutboxRepository {
  return {
    enqueue: vi.fn(),
    findDue: vi.fn().mockResolvedValue([item]),
    claim: vi.fn().mockResolvedValue(true),
    recoverStaleSending: vi.fn().mockResolvedValue(0),
    markSent: vi.fn().mockResolvedValue(undefined),
    scheduleRetry: vi.fn().mockResolvedValue(undefined),
    moveToDeadLetter: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IEmailOutboxRepository;
}

function makeRelay(
  outbox: IEmailOutboxRepository,
  sender: IIdempotentEmailSender,
  extra: Record<string, unknown> = {},
): EmailOutboxRelay {
  return new EmailOutboxRelay({
    outbox,
    sender,
    logger,
    enabled: true,
    pollMs: 1000,
    batchSize: 10,
    maxAttempts: 3,
    baseBackoffMs: 1000,
    staleAfterMs: 60_000,
    ...extra,
  });
}

const failWith = (error: unknown): IIdempotentEmailSender =>
  ({ send: vi.fn().mockRejectedValue(error) }) as unknown as IIdempotentEmailSender;

describe("EmailOutboxRelay — U-08 delivery guarantees", () => {
  let outbox: IEmailOutboxRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    outbox = makeOutbox();
  });

  it("sends with the stored idempotency key and records the provider message id", async () => {
    const sender = {
      send: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
    } as unknown as IIdempotentEmailSender;

    await makeRelay(outbox, sender).tick(now);

    expect(sender.send).toHaveBeenCalledWith(
      { to: item.toEmail, subject: item.subject, html: item.html },
      item.idempotencyKey,
    );
    expect(outbox.markSent).toHaveBeenCalledWith(item.id, "msg-123");
    expect(outbox.scheduleRetry).not.toHaveBeenCalled();
    expect(outbox.moveToDeadLetter).not.toHaveBeenCalled();
  });

  it("retries concurrent_idempotent_requests with linear first backoff", async () => {
    const sender = failWith(
      new EmailProviderError(
        "concurrent_idempotent_requests",
        "retry me",
        409,
      ),
    );

    await makeRelay(outbox, sender).tick(now);

    const retryAt = vi.mocked(outbox.scheduleRetry).mock.calls[0][2];
    expect(retryAt.getTime() - now.getTime()).toBe(1000);
    expect(outbox.moveToDeadLetter).not.toHaveBeenCalled();
  });

  it("doubles the backoff on the second attempt", async () => {
    const second = { ...item, attempts: 1 };
    outbox = makeOutbox({ findDue: vi.fn().mockResolvedValue([second]) });
    const sender = failWith(new Error("transient"));

    await makeRelay(outbox, sender).tick(now);

    const retryAt = vi.mocked(outbox.scheduleRetry).mock.calls[0][2];
    expect(retryAt.getTime() - now.getTime()).toBe(2000);
  });

  it("never retries invalid_idempotent_request — it goes straight to DLQ", async () => {
    const sender = failWith(
      new EmailProviderError(
        "invalid_idempotent_request",
        "bad key",
        409,
      ),
    );

    await makeRelay(outbox, sender).tick(now);

    expect(outbox.moveToDeadLetter).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ code: "invalid_idempotent_request" }),
    );
    expect(outbox.scheduleRetry).not.toHaveBeenCalled();
  });

  it("moves to DLQ after the third failed attempt", async () => {
    const third = { ...item, attempts: 2 };
    outbox = makeOutbox({ findDue: vi.fn().mockResolvedValue([third]) });
    const sender = failWith(new Error("still down"));

    await makeRelay(outbox, sender).tick(now);

    expect(outbox.moveToDeadLetter).toHaveBeenCalled();
    expect(outbox.scheduleRetry).not.toHaveBeenCalled();
  });

  it("never propagates a provider failure out of a tick", async () => {
    const sender = failWith(new Error("provider exploded"));

    await expect(makeRelay(outbox, sender).tick(now)).resolves.toBeUndefined();
  });

  it("skips rows already claimed by another app instance", async () => {
    outbox = makeOutbox({ claim: vi.fn().mockResolvedValue(false) });
    const sender = {
      send: vi.fn(),
    } as unknown as IIdempotentEmailSender;

    await makeRelay(outbox, sender).tick(now);

    expect(sender.send).not.toHaveBeenCalled();
    expect(outbox.markSent).not.toHaveBeenCalled();
  });

  it("recovers stale SENDING envelopes before reading due envelopes", async () => {
    outbox = makeOutbox({ recoverStaleSending: vi.fn().mockResolvedValue(2) });
    const sender = {
      send: vi.fn().mockResolvedValue({ messageId: "msg-recovered" }),
    } as unknown as IIdempotentEmailSender;

    await makeRelay(outbox, sender).tick(now);

    expect(outbox.recoverStaleSending).toHaveBeenCalledWith(
      new Date(now.getTime() - 60_000),
      now,
    );
    expect(
      vi.mocked(outbox.recoverStaleSending).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(outbox.findDue).mock.invocationCallOrder[0]);
    // Requeued rows are due immediately, so they are delivered in this tick.
    expect(sender.send).toHaveBeenCalledWith(
      { to: item.toEmail, subject: item.subject, html: item.html },
      item.idempotencyKey,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("stale"),
      expect.objectContaining({ action: "email.outbox.stale_recovered", recovered: 2 }),
    );
  });

  it("continues delivering due envelopes when stale recovery fails", async () => {
    const recoveryError = new Error("outbox unavailable");
    outbox = makeOutbox({
      recoverStaleSending: vi.fn().mockRejectedValue(recoveryError),
    });
    const sender = {
      send: vi.fn().mockResolvedValue({ messageId: "msg-ok" }),
    } as unknown as IIdempotentEmailSender;

    await expect(makeRelay(outbox, sender).tick(now)).resolves.toBeUndefined();

    expect(sender.send).toHaveBeenCalledOnce();
    expect(outbox.markSent).toHaveBeenCalledWith(item.id, "msg-ok");
    expect(logger.error).toHaveBeenCalledWith(
      "Email outbox stale recovery failed",
      recoveryError,
      expect.objectContaining({ action: "email.outbox.stale_recovery_failed" }),
    );
  });

  it("passes the persisted error to the outbox on failure", async () => {
    const sender = failWith(new Error("smtp timeout"));

    await makeRelay(outbox, sender).tick(now);

    const failure = vi.mocked(outbox.scheduleRetry).mock.calls[0][1] as EmailFailure;
    expect(failure.message).toBe("smtp timeout");
    expect(failure.code).toBe("UNKNOWN");
  });
});
