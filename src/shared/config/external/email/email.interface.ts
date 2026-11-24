export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSendResult {
  /** Provider-side message ID, or null when the provider did not return one. */
  messageId: string | null;
}

export interface IEmailService {
  send(input: SendEmailInput): Promise<EmailSendResult>;
}

/**
 * Outbox-only sender. Unlike IEmailService it MUST throw on provider failure
 * so the relay can classify the error and decide retry vs DLQ.
 */
export interface IIdempotentEmailSender {
  send(
    input: SendEmailInput,
    idempotencyKey: string,
  ): Promise<EmailSendResult>;
}
