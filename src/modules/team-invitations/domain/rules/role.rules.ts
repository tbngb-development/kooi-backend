import type { TenantRole } from "@prisma/client";

/**
 * Roles an actor is permitted to grant when inviting a teammate.
 *
 * Product decision: an OWNER may grant any role, an ADMIN may only grant
 * USER, and a USER may not invite at all. This is intentionally stricter
 * than a flat "OWNER/ADMIN can invite" route guard.
 */
const INVITABLE_ROLES: Readonly<Record<TenantRole, readonly TenantRole[]>> = {
  OWNER: ["OWNER", "ADMIN", "USER"],
  ADMIN: ["USER"],
  USER: [],
};

/** Whether `actorRole` is allowed to invite someone at `targetRole`. */
export function canInviteRole(
  actorRole: TenantRole,
  targetRole: TenantRole,
): boolean {
  return INVITABLE_ROLES[actorRole]?.includes(targetRole) ?? false;
}

/** Roles `actorRole` is allowed to grant (empty for roles that cannot invite). */
export function invitableRoles(actorRole: TenantRole): readonly TenantRole[] {
  return INVITABLE_ROLES[actorRole] ?? [];
}
