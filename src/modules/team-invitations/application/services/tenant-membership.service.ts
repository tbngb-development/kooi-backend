import type { TenantRole } from "@prisma/client";
import {
  canAcceptInvite,
  canAddInvite,
  getSeatAvailability,
  type SeatAvailability,
} from "../../domain/rules/seat.rules";
import { canInviteRole } from "../../domain/rules/role.rules";
import {
  RoleNotInvitableError,
  TeamSeatLimitError,
} from "../../domain/errors/invitation.errors";
import type {
  SeatLockContext,
  TenantMembershipRepository,
} from "../interfaces/tenant-membership.repository";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";

/**
 * Shared membership rules for every flow that adds a person to a tenant.
 *
 * Seat checks always run inside the tenant row lock supplied by the
 * repository, so invite and accept requests cannot race past a single free
 * seat. Role checks are pure and intentionally run before taking the lock.
 */
export class TenantMembershipService {
  constructor(
    private readonly repository: TenantMembershipRepository,
    private readonly planRepository: Pick<
      PlanRepository,
      "getActivePlanForTenant"
    >,
  ) {}

  countActiveMembers(tenantId: string): Promise<number> {
    return this.repository.countActiveMembers(tenantId);
  }

  async getSeatAvailability(tenantId: string): Promise<SeatAvailability> {
    const [activeMembers, pendingInvites, plan] = await Promise.all([
      this.repository.countActiveMembers(tenantId),
      this.repository.countPendingInvites(tenantId),
      this.planRepository.getActivePlanForTenant(tenantId),
    ]);

    return getSeatAvailability(
      activeMembers,
      pendingInvites,
      plan?.maxTeamMembers ?? null,
    );
  }

  /** Validate role hierarchy and invite-time seat capacity atomically. */
  async assertCanInvite(
    tenantId: string,
    _inviterId: string,
    inviterRole: TenantRole,
    targetRole: TenantRole,
  ): Promise<void> {
    if (!canInviteRole(inviterRole, targetRole)) {
      throw new RoleNotInvitableError();
    }

    await this.repository.withSeatLock(tenantId, (ctx) =>
      this.assertCanInviteInContext(ctx, tenantId, inviterRole, targetRole),
    );
  }

  /**
   * Role + invite-time seat check against an already-acquired lock context.
   * Used by the invitation service so the check and the insert share one
   * transaction.
   */
  async assertCanInviteInContext(
    ctx: SeatLockContext,
    tenantId: string,
    inviterRole: TenantRole,
    targetRole: TenantRole,
  ): Promise<void> {
    if (!canInviteRole(inviterRole, targetRole)) {
      throw new RoleNotInvitableError();
    }

    const plan = await this.planRepository.getActivePlanForTenant(tenantId);
    const limit = plan?.maxTeamMembers ?? null;

    const [activeMembers, pendingInvites] = await Promise.all([
      ctx.countActiveMembers(),
      ctx.countPendingInvites(),
    ]);
    if (!canAddInvite(activeMembers, pendingInvites, limit)) {
      throw new TeamSeatLimitError();
    }
  }

  /** Validate accept-time seat capacity. Pending invites do not count here. */
  async assertCanAccept(tenantId: string): Promise<void> {
    await this.repository.withSeatLock(tenantId, (ctx) =>
      this.assertCanAcceptInContext(ctx, tenantId),
    );
  }

  /** Accept-time seat check against an already-acquired lock context. */
  async assertCanAcceptInContext(
    ctx: SeatLockContext,
    tenantId: string,
  ): Promise<void> {
    const plan = await this.planRepository.getActivePlanForTenant(tenantId);
    const limit = plan?.maxTeamMembers ?? null;

    const activeMembers = await ctx.countActiveMembers();
    if (!canAcceptInvite(activeMembers, limit)) {
      throw new TeamSeatLimitError();
    }
  }

  /** Attach an existing global User to a tenant. Never creates a User. */
  addMember(
    tenantId: string,
    userId: string,
    role: TenantRole,
  ): Promise<void> {
    return this.repository.addMember(tenantId, { userId, role });
  }
}
