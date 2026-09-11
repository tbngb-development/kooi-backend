import { ValidationError } from "../../../../shared/errors";
import type { AuthRepository } from "../../../auth/application/interfaces/auth-repository.interface";
import type { PasswordService } from "../../../auth/application/interfaces/password-service.interface";
import type { TokenService } from "../../../auth/application/interfaces/token-service.interface";
import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { AcceptOwnerInviteInput } from "../dto/invite.dto";
import {
  InviteEmailMismatchError,
  InviteInvalidError,
  InviteNotFoundError,
  InviteAlreadyAcceptedError,
} from "../../domain/errors/invite.errors";
import { EmailAlreadyExistsError } from "../../../auth/domain/errors/auth.errors";
import { validatePasswordStrength } from "../../../auth/domain/rules/password.rules";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";

export class AcceptOwnerInviteUseCase {
  constructor(
    private readonly inviteRepo: InviteRepository,
    private readonly authRepo: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
  ) {}

  async execute(input: AcceptOwnerInviteInput) {
    const invite = await this.inviteRepo.findByToken(input.token);
    if (!invite) throw new InviteNotFoundError();
    if (invite.status === "ACCEPTED") throw new InviteAlreadyAcceptedError();
    if (invite.status !== "PENDING") throw new InviteInvalidError();
    if (invite.expiresAt < new Date()) throw new InviteInvalidError();

    if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new InviteEmailMismatchError();
    }

    const existing = await this.authRepo.findUserByEmail(input.email);
    if (existing) throw new EmailAlreadyExistsError();

    const passwordValidation = validatePasswordStrength(input.password);
    if (!passwordValidation.isValid) {
      throw new ValidationError(
        passwordValidation.errors.map((msg) => ({
          field: "password",
          message: msg,
        })),
      );
    }

    const passwordHash = await this.passwordService.hash(input.password);

    const result = await this.authRepo.registerTenantOwner({
      tenantName: invite.tenantName,
      tenantEmail: invite.email,
      userEmail: invite.email,
      userName: input.name,
      passwordHash,
    });

    // Resolve published version for the invited plan family
    const latestVersion = await this.planRepo.findLatestPublishedVersion(
      invite.planId,
    );
    if (!latestVersion) {
      throw new Error(`No published version found for plan ${invite.planId}`);
    }

    // Set TenantPlan to PENDING_PAYMENT via PlanRepository (records audit event)
    await this.planRepo.selectPlan(
      result.tenantId,
      invite.planId,
      latestVersion.id,
      result.user.id,
    );

    await this.walletRepo.ensureWallet(result.tenantId);
    await this.inviteRepo.markAccepted(invite.id);

    const accessToken = this.tokenService.generateAccessToken({
      userId: result.user.id,
      membershipId: result.membershipId,
      tenantId: result.tenantId,
      tenantRole: "OWNER",
      isPlatformAdmin: result.user.isPlatformAdmin,
    });

    const refreshTokenData = this.tokenService.generateRefreshToken(
      result.user.id,
    );
    await this.authRepo.saveRefreshToken({
      tokenHash: refreshTokenData.tokenHash,
      userId: result.user.id,
      expiresAt: new Date(Date.now() + refreshTokenData.expiresIn * 1000),
    });

    const plan = await this.planRepo.findById(invite.planId);

    return {
      accessToken,
      refreshToken: refreshTokenData.rawToken,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: refreshTokenData.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      tenant: {
        id: result.tenantId,
        name: invite.tenantName,
      },
      membership: {
        id: result.membershipId,
        role: "OWNER" as const,
      },
      paymentRequired: true as const,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
            onboardingFee: latestVersion.onboardingFee,
          }
        : null,
    };
  }
}
