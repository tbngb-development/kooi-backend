import type { EmailOutbox } from "@prisma/client";

export interface EmailFailure {
  code: string;
  message: string;
}

export interface EnqueueEmailInput {
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
}

export interface PendingEmail {
  id: string;
  idempotencyKey: string;
  toEmail: string;
  subject: string;
  html: string;
  attempts: number;
}

/**
 * Durable envelope store. Enqueue is idempotent by key; claim is an atomic
 * multi-instance lock. Delivery state and the provider message ID are persisted.
 */
export interface IEmailOutboxRepository {
  enqueue(input: EnqueueEmailInput): Promise<EmailOutbox>;
  findDue(limit: number, now?: Date): Promise<PendingEmail[]>;
  claim(id: string, now?: Date): Promise<boolean>;
  markSent(id: string, messageId: string | null): Promise<void>;
  scheduleRetry(id: string, error: EmailFailure, nextAttemptAt: Date): Promise<void>;
  moveToDeadLetter(id: string, error: EmailFailure): Promise<void>;
}
