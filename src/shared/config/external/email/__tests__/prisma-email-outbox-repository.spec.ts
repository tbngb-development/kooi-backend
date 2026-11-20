import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../database/prisma";
import { PrismaEmailOutboxRepository } from "../outbox-repository";

vi.mock("../../../database/prisma", () => ({
  default: {
    emailOutbox: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const now = new Date("2026-01-01T00:00:00Z");

const row = {
  id: "outbox-1",
  idempotencyKey: "warn:tenant-1:1",
  toEmail: "owner@example.com",
  subject: "Low balance",
  html: "<p>low</p>",
  status: "PENDING",
  attempts: 0,
  providerMessageId: null,
  lastError: null,
  lastErrorName: null,
  nextAttemptAt: now,
  sentAt: null,
  createdAt: now,
  updatedAt: now,
};

const uniqueViolation = () => Object.assign(new Error("unique constraint"), { code: "P2002" });

describe("PrismaEmailOutboxRepository — U-08 durability", () => {
  let repository: PrismaEmailOutboxRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaEmailOutboxRepository();
  });

  it("enqueues with the caller's idempotency key", async () => {
    vi.mocked(prisma.emailOutbox.create).mockResolvedValue(row as any);

    const result = await repository.enqueue({
      idempotencyKey: row.idempotencyKey,
      to: row.toEmail,
      subject: row.subject,
      html: row.html,
    });

    expect(result.id).toBe(row.id);
    expect(prisma.emailOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: row.idempotencyKey }),
      }),
    );
  });

  it("replay returns the same row instead of inserting a duplicate", async () => {
    vi.mocked(prisma.emailOutbox.create).mockRejectedValue(uniqueViolation());
    vi.mocked(prisma.emailOutbox.findUnique).mockResolvedValue(row as any);

    const result = await repository.enqueue({
      idempotencyKey: row.idempotencyKey,
      to: row.toEmail,
      subject: row.subject,
      html: row.html,
    });

    expect(result.id).toBe(row.id);
    expect(prisma.emailOutbox.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: row.idempotencyKey },
    });
  });

  it("atomically claims a due row and increments attempts", async () => {
    vi.mocked(prisma.emailOutbox.updateMany).mockResolvedValue({ count: 1 });

    const claimed = await repository.claim(row.id, now);

    expect(claimed).toBe(true);
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: {
        id: row.id,
        status: { in: ["PENDING", "RETRYING"] },
        nextAttemptAt: { lte: now },
      },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
  });

  it("returns false when another instance already claimed the row", async () => {
    vi.mocked(prisma.emailOutbox.updateMany).mockResolvedValue({ count: 0 });

    expect(await repository.claim(row.id, now)).toBe(false);
  });

  it("requeues stale SENDING envelopes without consuming another attempt now", async () => {
    const staleBefore = new Date(now.getTime() - 60_000);
    vi.mocked(prisma.emailOutbox.updateMany).mockResolvedValue({ count: 1 });

    const recovered = await repository.recoverStaleSending(staleBefore, now);

    expect(recovered).toBe(1);
    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: {
        status: "SENDING",
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: "RETRYING",
        nextAttemptAt: now,
        lastError: "Delivery was interrupted before the result was recorded",
        lastErrorName: "SENDING_RECOVERY",
      },
    });
  });

  it("reports zero when no SENDING envelope is older than the cutoff", async () => {
    vi.mocked(prisma.emailOutbox.updateMany).mockResolvedValue({ count: 0 });

    expect(
      await repository.recoverStaleSending(new Date(now.getTime() - 60_000), now),
    ).toBe(0);
  });

  it("records successful delivery with the provider message id", async () => {
    vi.mocked(prisma.emailOutbox.update).mockResolvedValue(row as any);

    await repository.markSent(row.id, "msg-123");

    expect(prisma.emailOutbox.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: {
        status: "SENT",
        providerMessageId: "msg-123",
        sentAt: expect.any(Date),
        lastError: null,
        lastErrorName: null,
      },
    });
  });

  it("schedules a retry with the failure details", async () => {
    const retryAt = new Date(now.getTime() + 2000);
    vi.mocked(prisma.emailOutbox.update).mockResolvedValue(row as any);

    await repository.scheduleRetry(
      row.id,
      { code: "concurrent_idempotent_requests", message: "retry" },
      retryAt,
    );

    expect(prisma.emailOutbox.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: {
        status: "RETRYING",
        lastError: "retry",
        lastErrorName: "concurrent_idempotent_requests",
        nextAttemptAt: retryAt,
      },
    });
  });

  it("moves a poison message to the DLQ", async () => {
    vi.mocked(prisma.emailOutbox.update).mockResolvedValue(row as any);

    await repository.moveToDeadLetter(row.id, {
      code: "invalid_idempotent_request",
      message: "bad key",
    });

    expect(prisma.emailOutbox.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: {
        status: "DEAD",
        lastError: "bad key",
        lastErrorName: "invalid_idempotent_request",
      },
    });
  });
});
