import { Resend } from "resend";
import { env } from "../../env";
import type { IEmailService, SendEmailInput } from "./email.interface";
import type { Logger } from "../../../logging/logger.interface";

export class ResendEmailService implements IEmailService {
  private readonly client: Resend | null;

  constructor(private readonly logger?: Logger) {
    this.client = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.client) {
      this.logger?.warn("Resend API key not set — skipping email delivery", {
        action: "email.send_skipped",
        subject: input.subject,
        to: input.to,
      });
      return;
    }

    try {
      await this.client.emails.send({
        from: env.resend.fromEmail,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });

      this.logger?.info("Email sent successfully", {
        action: "email.send_success",
        subject: input.subject,
        to: input.to,
      });
    } catch (err) {
      // Never break user flows on email failure
      this.logger?.error("Email delivery failed", err, {
        action: "email.send_failed",
        subject: input.subject,
        to: input.to,
      });
    }
  }
}
