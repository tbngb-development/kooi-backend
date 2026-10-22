import { Resend } from "resend";
import type {
  IContactEmailService,
  ContactEmailPayload,
} from "../application/interfaces/contact-email-service.interface";
import { EmailDeliveryError } from "../domain/errors/contact.errors";
import type { Logger } from "../../../shared/logging/logger.interface";
import { env } from "../../../shared/config/env";

export class ResendContactEmailService implements IContactEmailService {
  private readonly client: Resend | null;

  constructor(private readonly logger?: Logger) {
    this.client = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;
  }

  async send(
    payload: ContactEmailPayload,
  ): Promise<{ success: boolean; id?: string }> {
    if (!this.client || !env.resend.apiKey) {
      this.logger?.error(
        "Resend API key is not configured — contact email delivery failed",
        {
          action: "contact.email.missing_key",
          to: payload.to,
          subject: payload.subject,
        },
      );
      throw new EmailDeliveryError(
        "Email delivery service is currently not configured.",
      );
    }

    try {
      const response = await this.client.emails.send({
        from: payload.from || env.resend.fromEmail,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      if (response.error) {
        this.logger?.error(
          "Resend delivery failed with error response",
          response.error,
          {
            action: "contact.email.resend_error",
            to: payload.to,
            subject: payload.subject,
          },
        );
        throw new EmailDeliveryError(
          response.error.message || "Failed to deliver contact email via provider.",
          response.error,
        );
      }

      this.logger?.info("Contact notification email sent successfully", {
        action: "contact.email.sent",
        messageId: response.data?.id,
        to: payload.to,
        subject: payload.subject,
      });

      return {
        success: true,
        id: response.data?.id,
      };
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        throw err;
      }
      this.logger?.error("Unexpected error delivering contact email", err, {
        action: "contact.email.unexpected_failure",
        to: payload.to,
        subject: payload.subject,
      });
      throw new EmailDeliveryError(
        "Failed to deliver contact email due to provider connection error.",
        err,
      );
    }
  }
}
