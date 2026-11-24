import { env } from "../../../../shared/config/env";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { IInvitationEmailSender } from "../../application/interfaces/invitation-email-sender";
import { ConsoleInvitationEmailSender } from "./console-invitation-email.sender";
import { ResendInvitationEmailSender } from "./resend-invitation-email.sender";

/**
 * `auto` logs the link in development and uses Resend elsewhere. `console`
 * and `resend` force a transport — useful for local verification and tests.
 */
export function buildInvitationEmailSender(
  logger: Logger,
): IInvitationEmailSender {
  const mode = env.teamInvites.emailMode;
  const useConsole = mode === "console" || (mode === "auto" && env.isDev);
  return useConsole
    ? new ConsoleInvitationEmailSender(logger)
    : new ResendInvitationEmailSender(logger);
}
