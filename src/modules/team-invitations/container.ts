import { PrismaInvitationRepository } from "./infrastructure/repositories/prisma-invitation.repository";
import type { InvitationRepository } from "./application/interfaces/invitation.repository";
import { TenantMembershipService } from "./application/services/tenant-membership.service";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";

export interface TeamInvitationModule {
  repository: InvitationRepository;
  membershipService: TenantMembershipService;
}

export interface BuildTeamInvitationModuleDependencies {
  repository?: InvitationRepository;
  planRepository: PlanRepository;
}

/** Wires the shared invitation/membership repository and membership service. */
export function buildTeamInvitationModule(
  deps: BuildTeamInvitationModuleDependencies,
): TeamInvitationModule {
  const repository = deps.repository ?? new PrismaInvitationRepository();
  const membershipService = new TenantMembershipService(
    repository,
    deps.planRepository,
  );

  return { repository, membershipService };
}
