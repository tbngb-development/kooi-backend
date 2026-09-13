import { ValidationError } from "../../../../shared/errors";
import type { AuthRepository } from "../../../auth/application/interfaces/auth-repository.interface";
import type { PasswordService } from "../../../auth/application/interfaces/password-service.interface";
import type { TokenService } from "../../../auth/application/interfaces/token-service.interface";
import type { InviteRepository } from "../interfaces/invite-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { RechargeRepository } from "../../../payments/application/interfaces/recharge-repository.interface";
import type { AutoAssignKeyUseCase } from "../../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type {
  AcceptOwnerInviteInput,
  AcceptOwnerInviteResponse,
} from "../dto/invite.dto";
import {
  InviteEmailMismatchError,
  InviteInvalidError,
  InviteNotFoundError,
  InviteAlreadyAcceptedError,
} from "../../domain/errors/invite.errors";
import { EmailAlreadyExistsError } from "../../../auth/domain/errors/auth.errors";
import { validatePasswordStrength } from "../../../auth/domain/rules/password.rules";

export class AcceptOwnerInviteUseCase {
  constructor(
    private readonly inviteRepo: InviteRepository,
    private readonly authRepo: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly rechargeRepo: RechargeRepository, // ← NEW
    private readonly autoAssignKey: AutoAssignKeyUseCase, // ← NEW
  ) {}

  async execute(
    input: AcceptOwnerInviteInput,
  ): Promise<AcceptOwnerInviteResponse> {
    // ── 1. Validate invite ───────────────────────────────────────
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

    // ── 2. Register tenant + user ────────────────────────────────
    const passwordHash = await this.passwordService.hash(input.password);

    const result = await this.authRepo.registerTenantOwner({
      tenantName: invite.tenantName,
      tenantEmail: invite.email,
      userEmail: invite.email,
      userName: input.name,
      passwordHash,
    });

    // ── 3. Resolve plan version ──────────────────────────────────
    const latestVersion = await this.planRepo.findLatestPublishedVersion(
      invite.planId,
    );
    if (!latestVersion) {
      throw new Error(`No published version found for plan ${invite.planId}`);
    }

    const plan = await this.planRepo.findById(invite.planId);

    // ── 4. Compute effective pricing ─────────────────────────────
    const originalFee = latestVersion.onboardingFee;
    const discountPercent = invite.skipPayment ? 0 : invite.discountPercent;
    const discountAmount = invite.skipPayment
      ? originalFee
      : Math.round(originalFee * (discountPercent / 100));
    const effectiveFee = originalFee - discountAmount;

    // If effective fee is 0 (free plan or 100% discount), treat as skip
    const actualSkipPayment = invite.skipPayment || effectiveFee === 0;

    // ── 5. Create TenantPlan (PENDING_PAYMENT initially) ─────────
    const tenantPlan = await this.planRepo.selectPlan(
      result.tenantId,
      invite.planId,
      latestVersion.id,
      result.user.id,
    );

    let paymentRequired: boolean;

    if (actualSkipPayment) {
      // ── BRANCH A: Skip Payment — activate immediately ──────────

      // Set override to 0 if original fee was non-zero
      if (originalFee > 0) {
        await this.planRepo.updateOverrides(
          result.tenantId,
          { onboardingFeeOverride: 0 },
          result.user.id,
        );
      }

      // Activate plan
      const bonusExpiresAt = latestVersion.bonusValidityDays
        ? new Date(
            Date.now() + latestVersion.bonusValidityDays * 24 * 60 * 60 * 1000,
          )
        : null;

      await this.planRepo.activatePlan(
        result.tenantId,
        latestVersion.id,
        bonusExpiresAt,
        result.user.id,
      );

      // Auto-assign Bolna API key
      try {
        await this.autoAssignKey.execute(result.tenantId);
      } catch (err) {
        console.error("[AcceptInvite] auto-assign Bolna key failed:", err);
      }

      // Credit included balance if admin enabled it
      if (invite.creditIncludedBalance && latestVersion.includedBalance > 0) {
        await this.walletRepo.ensureWallet(result.tenantId);
        await this.walletRepo.credit({
          tenantId: result.tenantId,
          amount: latestVersion.includedBalance,
          type: "BONUS",
          targetBalance: "BONUS",
          description: `Plan bonus — ${plan?.name ?? "plan"} (free onboarding via invite)`,
          sourceType: "PLAN_BONUS",
          sourceId: tenantPlan.id,
          idempotencyKey: `plan_bonus:${tenantPlan.id}:${latestVersion.id}`,
          createdBy: result.user.id,
          bonusExpiresAt,
        });
      }

      // Create offline recharge record for audit trail
      const wallet = await this.walletRepo.ensureWallet(result.tenantId);
      await this.rechargeRepo.create({
        walletId: wallet.id,
        tenantId: result.tenantId,
        amount: 0,
        purpose: "ONBOARDING",
        status: "SUCCESS",
        provider: "offline",
        tenantPlanId: tenantPlan.id,
        targetPlanVersionId: latestVersion.id,
      });

      paymentRequired = false;
    } else {
      // ── BRANCH B: Payment Required — apply discount override ───

      if (discountPercent > 0 && effectiveFee !== originalFee) {
        await this.planRepo.updateOverrides(
          result.tenantId,
          { onboardingFeeOverride: effectiveFee },
          result.user.id,
        );
      }

      await this.walletRepo.ensureWallet(result.tenantId);
      paymentRequired = true;
    }

    // ── 6. Finalize invite ───────────────────────────────────────
    await this.inviteRepo.markAccepted(invite.id);

    // ── 7. Generate tokens ───────────────────────────────────────
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
      paymentRequired,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
            onboardingFee: effectiveFee,
            discountPercent,
            discountAmount,
            payableAmount: effectiveFee,
          }
        : null,
    };
  }
}
