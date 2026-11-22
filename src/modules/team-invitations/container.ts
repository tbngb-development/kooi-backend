import type { Logger } from "../../shared/logging/logger.interface";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";
import type {
  AuthRepository,
} from "../auth/application/interfaces/auth-repository.interface";
import type { PasswordService } from "../auth/application/interfaces/password-service.interface";
import type { SelectTenantUseCase } from "../auth/application/use-cases/select-tenant.use-case";

import { PrismaInvitationRepository } from "./infrastructure/repositories/prisma-invitation.repository";
import { InvitationTokenServiceImpl } from "./infrastructure/services/invitation-token.service";
import { InvitationExpiryScheduler } from "./infrastructure/jobs/invitation-expiry.scheduler";
import { TenantMembershipService } from "./application/services/tenant-membership.service";
import { InvitationService } from "./application/services/invitation.service";
import { TenantInvitationController } from "./presentation/tenant-invitation.controller";
import { PublicInvitationController } from "./presentation/public-invitation.controller";

import type { InvitationRepository } from "./application/interfaces/invitation.repository";
import type { InvitationTokenService } from "./application/interfaces/invitation-token.service";

export interface TeamInvitationModule {
  repository: InvitationRepository;
  membershipService: TenantMembershipService;
  tokenService: InvitationTokenService;
  service: InvitationService;
  tenantController: TenantInvitationController;
  publicController: PublicInvitationController;
  schedulers: {
    invitationExpiry: InvitationExpiryScheduler;
  };
}

export interface BuildTeamInvitationModuleDependencies {
  repository?: InvitationRepository;
  planRepository: PlanRepository;
  authRepository: AuthRepository;
  passwordService: PasswordService;
  /** The existing auth use case issues sessions; no token logic is duplicated. */
  sessionIssuer: Pick<SelectTenantUseCase, "execute">;
  logger: Logger;
}

/** Wires the shared invitation/membership repository and full lifecycle. */
export function buildTeamInvitationModule(
  deps: BuildTeamInvitationModuleDependencies,
): TeamInvitationModule {
  const log = deps.logger.child({ module: "team-invitations" });
  const repository = deps.repository ?? new PrismaInvitationRepository();
  const membershipService = new TenantMembershipService(
    repository,
    deps.planRepository,
  );
  const tokenService = new InvitationTokenServiceImpl();
  const service = new InvitationService({
    repository,
    membershipService,
    tokenService,
    passwordService: deps.passwordService,
    sessionIssuer: deps.sessionIssuer,
    authRepository: deps.authRepository,
    logger: log,
  });

  return {
    repository,
    membershipService,
    tokenService,
    service,
    tenantController: new TenantInvitationController(service),
    publicController: new PublicInvitationController(service),
    schedulers: {
      invitationExpiry: new InvitationExpiryScheduler(service, log),
    },
  };
}
