import { Resend } from "resend";
import { env } from "../../env";
import type {
  EmailSendResult,
  IIdempotentEmailSender,
  SendEmailInput,
} from "./email.interface";
import { EmailProviderError } from "./email.errors";
import type { Logger } from "../../../logging/logger.interface";

/**
 * Idempotent, throwing Resend sender used only by the outbox relay.
 * The provider receives the caller's stable key as `Idempotency-Key`, so a
 * replayed envelope returns the original message instead of sending twice.
 */
export class ResendIdempotentEmailSender implements IIdempotentEmailSender {
  private readonly client: Resend | null;

  constructor(private readonly logger?: Logger) {
    this.client = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;
  }

  async send(
    input: SendEmailInput,
    idempotencyKey: string,
  ): Promise<EmailSendResult> {
    if (!this.client) {
      throw new EmailProviderError(
        "missing_api_key",
        "Resend API key is not configured",
      );
    }

    const response = await this.client.emails.send(
      {
        from: env.resend.fromEmail,
        to: input.to,
        subject: input.subject,
        html: input.html,
      },
      { idempotencyKey },
    );

    if (response.error) {
      throw new EmailProviderError(
        response.error.name,
        response.error.message,
        response.error.statusCode,
      );
    }

    this.logger?.debug("Idempotent email delivered", {
      action: "email.outbox.provider_sent",
      idempotencyKey,
      messageId: response.data?.id ?? null,
    });

    return { messageId: response.data?.id ?? null };
  }
}
