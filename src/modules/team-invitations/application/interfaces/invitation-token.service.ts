/**
 * Token operations for team invitations.
 *
 * The raw token is handed to the email layer only. Persistence stores the
 * SHA-256 hash, so lookup and verification are performed against the hash.
 */
export interface InvitationTokenService {
  /** Generate a fresh random token. Never log or persist the return value. */
  generate(): string;
  /** Hash a raw token for storage/lookup. */
  hash(rawToken: string): string;
  /** Constant-time comparison of a raw token against a stored hash. */
  verify(rawToken: string, tokenHash: string): boolean;
}
