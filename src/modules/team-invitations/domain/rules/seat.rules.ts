export interface SeatAvailability {
  /** Active TenantUser rows. */
  used: number;
  /** Non-expired PENDING invitations. */
  pending: number;
  /** Plan team-member cap; null means unlimited. */
  limit: number | null;
  /** Remaining seats (clamped to zero), or null when unlimited. */
  available: number | null;
}

/**
 * Compute seat usage for a tenant.
 *
 * A null limit means unlimited (available is also null so callers can render
 * an "Unlimited" state rather than a number). When over the limit (for
 * example after a plan downgrade) available is clamped to zero.
 */
export function getSeatAvailability(
  activeMembers: number,
  pendingInvites: number,
  limit: number | null,
): SeatAvailability {
  return {
    used: activeMembers,
    pending: pendingInvites,
    limit,
    available:
      limit === null
        ? null
        : Math.max(0, limit - activeMembers - pendingInvites),
  };
}

/**
 * Invite-time capacity check.
 *
 * Pending (non-expired) invitations reserve a seat, so members + pending
 * invites must be strictly below the limit to create another one.
 */
export function canAddInvite(
  activeMembers: number,
  pendingInvites: number,
  limit: number | null,
): boolean {
  return limit === null || activeMembers + pendingInvites < limit;
}

/**
 * Accept-time capacity check.
 *
 * The invitation being accepted is already counted as pending, so only
 * active members are checked here to avoid double counting.
 */
export function canAcceptInvite(
  activeMembers: number,
  limit: number | null,
): boolean {
  return limit === null || activeMembers < limit;
}
