import type { EmailOutbox } from "@prisma/client";
import prisma from "../../database/prisma";
import type {
  EmailFailure,
  EnqueueEmailInput,
  IEmailOutboxRepository,
  PendingEmail,
} from "./outbox-repository.types";

export type { EmailFailure, EnqueueEmailInput, IEmailOutboxRepository, PendingEmail };

export class PrismaEmailOutboxRepository implements IEmailOutboxRepository {
  async enqueue(input: EnqueueEmailInput): Promise<EmailOutbox> {
    try {
      return await prisma.emailOutbox.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          toEmail: input.to,
          subject: input.subject,
          html: input.html,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== "P2002") throw err;

      // Replay: return the existing row so the caller sees the same envelope.
      const existing = await prisma.emailOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!existing) throw err;
      return existing;
    }
  }

  async findDue(limit: number, now: Date = new Date()): Promise<PendingEmail[]> {
    const rows = await prisma.emailOutbox.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      toEmail: row.toEmail,
      subject: row.subject,
      html: row.html,
      attempts: row.attempts,
    }));
  }

  /** Atomic multi-instance claim: only one caller flips a due row to SENDING. */
  async claim(id: string, now: Date = new Date()): Promise<boolean> {
    const result = await prisma.emailOutbox.updateMany({
      where: {
        id,
        status: { in: ["PENDING", "RETRYING"] },
        nextAttemptAt: { lte: now },
      },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    return result.count === 1;
  }

  /**
   * A crash between `claim()` and the terminal write leaves the row SENDING
   * forever. While SENDING, `updatedAt` is the claim time, so rows older than
   * the cutoff are requeued for an immediate retry. The provider idempotency
   * key prevents a duplicate delivery if the old sender actually succeeded.
   */
  async recoverStaleSending(
    staleBefore: Date,
    now: Date = new Date(),
  ): Promise<number> {
    const result = await prisma.emailOutbox.updateMany({
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
    return result.count;
  }

  async markSent(id: string, messageId: string | null): Promise<void> {
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        status: "SENT",
        providerMessageId: messageId,
        sentAt: new Date(),
        lastError: null,
        lastErrorName: null,
      },
    });
  }

  async scheduleRetry(
    id: string,
    error: EmailFailure,
    nextAttemptAt: Date,
  ): Promise<void> {
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        status: "RETRYING",
        lastError: error.message,
        lastErrorName: error.code,
        nextAttemptAt,
      },
    });
  }

  async moveToDeadLetter(id: string, error: EmailFailure): Promise<void> {
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        status: "DEAD",
        lastError: error.message,
        lastErrorName: error.code,
      },
    });
  }
}
