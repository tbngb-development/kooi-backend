import { Resend } from "resend";
import { env } from "../../../../shared/config/env";
import { EmailProviderError } from "../../../../shared/config/external/email/email.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  IInvitationEmailSender,
  TeamInviteEmail,
} from "../../application/interfaces/invitation-email-sender";

/** Resend-backed sender. Throws so the Bull worker can retry a failed send. */
export class ResendInvitationEmailSender implements IInvitationEmailSender {
  private readonly client: Resend | null;

  constructor(private readonly logger?: Logger) {
    this.client = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;
  }

  async send(email: TeamInviteEmail): Promise<void> {
    if (!this.client) {
      throw new EmailProviderError(
        "missing_api_key",
        "Resend API key is not configured",
      );
    }

    const response = await this.client.emails.send({
      from: env.resend.fromEmail,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (response.error) {
      throw new EmailProviderError(
        response.error.name,
        response.error.message,
        response.error.statusCode,
      );
    }

    this.logger?.debug("Team invitation email delivered", {
      action: "invitation.email.provider_sent",
      messageId: response.data?.id ?? null,
    });
  }
}
