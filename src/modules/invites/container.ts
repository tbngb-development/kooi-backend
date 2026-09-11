import { PrismaInviteRepository } from "./infrastructure/repositories/prisma-invite.repository";
import type { InviteRepository } from "./application/interfaces/invite-repository.interface";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";
import type { AuthRepository } from "../auth/application/interfaces/auth-repository.interface";
import type { WalletRepository } from "../wallet/application/interfaces/wallet-repository.interface";
import type { PasswordService } from "../auth/application/interfaces/password-service.interface";
import type { TokenService } from "../auth/application/interfaces/token-service.interface";
import type { IEmailService } from "../../shared/config/external/email/email.interface";

import { CreateOwnerInviteUseCase } from "./application/use-cases/create-owner-invite.use-case";
import { GetOwnerInviteUseCase } from "./application/use-cases/get-owner-invite.use-case";
import { AcceptOwnerInviteUseCase } from "./application/use-cases/accept-owner-invite.use-case";

import { AdminInviteController } from "./presentation/admin-invite.controller";
import { PublicInviteController } from "./presentation/public-invite.controller";
import { ResendOwnerInviteUseCase } from "./application/use-cases/resend-owner-invite.use-case";
import { RevokeOwnerInviteUseCase } from "./application/use-cases/revoke-owner-invite.use-case";
import { ListOwnerInvitesUseCase } from "./application/use-cases/list-owner-invites.use-case";

export interface InviteModuleDeps {
  planRepository: PlanRepository;
  authRepository: AuthRepository;
  walletRepository: WalletRepository;
  passwordService: PasswordService;
  tokenService: TokenService;
  emailService: IEmailService;
}

export interface InviteModule {
  repository: InviteRepository;
  adminController: AdminInviteController;
  publicController: PublicInviteController;
}

export function buildInviteModule(deps: InviteModuleDeps): InviteModule {
  const repository = new PrismaInviteRepository();

  const createInvite = new CreateOwnerInviteUseCase(
    repository,
    deps.planRepository,
    deps.emailService,
  );

  const getOwnerInvite = new GetOwnerInviteUseCase(
    repository,
    deps.planRepository,
  );

  const acceptInvite = new AcceptOwnerInviteUseCase(
    repository,
    deps.authRepository,
    deps.passwordService,
    deps.tokenService,
    deps.planRepository,
    deps.walletRepository,
  );

  const resendInvite = new ResendOwnerInviteUseCase(
    repository,
    deps.emailService,
  );
  const revokeInvite = new RevokeOwnerInviteUseCase(repository);

  const listInvites = new ListOwnerInvitesUseCase(repository);

  return {
    repository,
    adminController: new AdminInviteController(
      createInvite,
      resendInvite,
      revokeInvite,
      listInvites,
    ),
    publicController: new PublicInviteController(getOwnerInvite, acceptInvite),
  };
}
