export interface TeamInviteEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * The accept link, which is the only sanctioned carrier of the raw token.
   * Used by the local development transport; ignored by the provider sender.
   */
  acceptUrl: string;
}

/**
 * Delivers an already-rendered team invitation email. Implementations MUST
 * throw on provider failure so the worker retries instead of silently
 * marking the invitation as sent.
 */
export interface IInvitationEmailSender {
  send(email: TeamInviteEmail): Promise<void>;
}
