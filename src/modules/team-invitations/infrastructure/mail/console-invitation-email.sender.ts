import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  IInvitationEmailSender,
  TeamInviteEmail,
} from "../../application/interfaces/invitation-email-sender";

/**
 * Local development transport. Instead of calling a provider it logs the
 * accept link so the flow can be tested end-to-end without a Resend key.
 *
 * The link is the one sanctioned carrier of the raw token; it is logged only
 * by this dev-only implementation, never by application logs in production.
 */
export class ConsoleInvitationEmailSender implements IInvitationEmailSender {
  constructor(private readonly logger: Logger) {}

  async send(email: TeamInviteEmail): Promise<void> {
    this.logger.info(
      `[DEV] Team invitation email not sent. Accept link: ${email.acceptUrl}`,
      { action: "invitation.email.dev_link" },
    );
  }
}
