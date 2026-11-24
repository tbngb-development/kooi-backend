import type { InvitationStatus } from "@prisma/client";

export type InviteInvalidReason = "INVALID" | "EXPIRED";

/** Normalise an invite email so lookups and storage cannot diverge by case. */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Mask the local part of an email for public preview. The domain remains so a
 * recipient can still recognise the workspace that invited them.
 */
export function maskEmail(email: string): string {
  const normalized = normalizeInviteEmail(email);
  const separator = normalized.indexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) {
    return "***";
  }
  return `${normalized[0]}***${normalized.slice(separator)}`;
}

/**
 * Why an invite cannot be used, or null when it is still valid.
 *
 * Expired state and a PENDING invite whose expiry has passed both produce
 * EXPIRED so the UI can offer "ask for a new invite". Revoked and accepted
 * invites produce the generic INVALID to avoid leaking lifecycle detail.
 */
export function getInviteInvalidReason(
  status: InvitationStatus,
  expiresAt: Date,
  now: Date,
): InviteInvalidReason | null {
  if (status === "EXPIRED") return "EXPIRED";
  if (status !== "PENDING") return "INVALID";
  return expiresAt.getTime() <= now.getTime() ? "EXPIRED" : null;
}

/** Whether an invite is currently pending and unexpired. */
export function isPendingInvite(
  status: InvitationStatus,
  expiresAt: Date,
  now: Date,
): boolean {
  return getInviteInvalidReason(status, expiresAt, now) === null;
}
