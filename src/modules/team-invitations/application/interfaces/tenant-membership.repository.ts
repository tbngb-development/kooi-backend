import type { TenantRole } from "@prisma/client";

/** A member to attach to a tenant. The global User must already exist. */
export interface AddMemberInput {
  userId: string;
  role: TenantRole;
}

/**
 * Operations available while holding the tenant row lock.
 *
 * All reads/writes in a capacity-check transaction must go through this
 * context so that concurrent invite/accept requests cannot both observe a
 * free seat.
 */
export interface SeatLockContext {
  countActiveMembers(): Promise<number>;
  countPendingInvites(): Promise<number>;
  addMember(input: AddMemberInput): Promise<void>;
}

/**
 * Membership persistence port used by TenantMembershipService.
 *
 * Kept deliberately narrow so membership logic can be reused by any future
 * flow. PrismaInvitationRepository implements this via its seat-lock
 * transaction.
 */
export interface TenantMembershipRepository {
  countActiveMembers(tenantId: string): Promise<number>;
  countPendingInvites(tenantId: string): Promise<number>;
  addMember(tenantId: string, input: AddMemberInput): Promise<void>;
  withSeatLock<T>(
    tenantId: string,
    work: (ctx: SeatLockContext) => Promise<T>,
  ): Promise<T>;
}
