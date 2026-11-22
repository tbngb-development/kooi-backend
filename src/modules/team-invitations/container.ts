import type { Logger } from "../../shared/logging/logger.interface";
import { env } from "../../shared/config/env";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";
import type {
  AuthRepository,
} from "../auth/application/interfaces/auth-repository.interface";
import type { PasswordService } from "../auth/application/interfaces/password-service.interface";
import type { SelectTenantUseCase } from "../auth/application/use-cases/select-tenant.use-case";

import { PrismaInvitationRepository } from "./infrastructure/repositories/prisma-invitation.repository";
import { InvitationTokenServiceImpl } from "./infrastructure/services/invitation-token.service";
import { InvitationExpiryScheduler } from "./infrastructure/jobs/invitation-expiry.scheduler";
import { InvitationEmailWorker } from "./infrastructure/jobs/invitation-email.worker";
import { BullInvitationDeliveryQueue } from "./infrastructure/queue/bull-invitation-delivery-queue";
import { buildInvitationEmailSender } from "./infrastructure/mail/invitation-email-sender.factory";
import { TenantMembershipService } from "./application/services/tenant-membership.service";
import { InvitationService } from "./application/services/invitation.service";
import { TenantInvitationController } from "./presentation/tenant-invitation.controller";
import { PublicInvitationController } from "./presentation/public-invitation.controller";

import type { InvitationRepository } from "./application/interfaces/invitation.repository";
import type { InvitationTokenService } from "./application/interfaces/invitation-token.service";
import type { IInvitationDeliveryQueue } from "./application/interfaces/invitation-delivery-queue";
import type { IInvitationEmailSender } from "./application/interfaces/invitation-email-sender";

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
  workers: {
    invitationEmail: InvitationEmailWorker;
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
  /** Overridable for tests; production uses the Bull queue adapter. */
  deliveryQueue?: IInvitationDeliveryQueue;
  /** Overridable for tests; production picks a transport from the environment. */
  invitationEmailSender?: IInvitationEmailSender;
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
  const deliveryQueue = deps.deliveryQueue ?? new BullInvitationDeliveryQueue();
  const emailSender =
    deps.invitationEmailSender ?? buildInvitationEmailSender(log);
  const service = new InvitationService({
    repository,
    membershipService,
    tokenService,
    passwordService: deps.passwordService,
    sessionIssuer: deps.sessionIssuer,
    authRepository: deps.authRepository,
    deliveryQueue,
    logger: log,
  });
  const invitationEmailWorker = new InvitationEmailWorker({
    repository,
    tokenService,
    sender: emailSender,
    logger: log,
    frontendUrl: env.frontendUrl,
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
    workers: {
      invitationEmail: invitationEmailWorker,
    },
  };
}
