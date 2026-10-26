import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { AutoAssignKeyUseCase } from "../../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import {
  PlanAlreadyActiveError,
  NoPendingPlanError,
  OnboardingFeeNotZeroError,
} from "../../domain/errors/payment.errors";
import type {
  ActivateFreeOnboardingInput,
  ActivateFreeOnboardingResult,
} from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Activates a tenant plan with ₹0 onboarding fee.
 * Used for Enterprise customers or promotional activations.
 * No Razorpay transaction is created.
 *
 * Flow:
 *  1. Validate TenantPlan is PENDING_PAYMENT
 *  2. Validate effective onboardingFee is ₹0
 *  3. Activate plan (creates TenantPlanEvent internally)
 *  4. Credit included bonus balance to wallet
 *  5. Auto-assign Bolna API key
 */
export class ActivateFreeOnboardingUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly autoAssignKey: AutoAssignKeyUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: ActivateFreeOnboardingInput,
  ): Promise<ActivateFreeOnboardingResult> {
    // 1. Validate tenant plan state
    const tenantPlan = await this.planRepo.getTenantPlan(input.tenantId);
    if (!tenantPlan) throw new TenantPlanNotFoundError(input.tenantId);
    if (tenantPlan.status === "ACTIVE") throw new PlanAlreadyActiveError();
    if (tenantPlan.status !== "PENDING_PAYMENT") throw new NoPendingPlanError();

    // 2. Resolve effective terms and validate onboarding fee or contract waiver
    const effectiveTerms = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!effectiveTerms) throw new TenantPlanNotFoundError(input.tenantId);
    if (effectiveTerms.onboardingFee > 0) {
      if (!input.waiverReason || input.waiverReason.trim().length < 10) {
        throw new OnboardingFeeNotZeroError(effectiveTerms.onboardingFee);
      }
      this.logger.warn("Onboarding fee waived by platform administrator", {
        action: "payment.free_onboarding.fee_waived",
        tenantId: input.tenantId,
        planVersionId: effectiveTerms.planVersionId,
        standardOnboardingFee: effectiveTerms.onboardingFee,
        waiverReason: input.waiverReason.trim(),
        adminUserId: input.adminUserId,
      });
    }

    // 3. Activate plan (PlanRepository handles TenantPlanEvent creation)
    const bonusExpiresAt = effectiveTerms.bonusValidityDays
      ? new Date(
          Date.now() + effectiveTerms.bonusValidityDays * 24 * 60 * 60 * 1000,
        )
      : null;

    await this.planRepo.activatePlan(
      input.tenantId,
      effectiveTerms.planVersionId,
      bonusExpiresAt,
      input.adminUserId,
    );

    // 4. Auto-assign Bolna API key
    try {
      await this.autoAssignKey.execute(input.tenantId);
    } catch (err) {
      this.logger.error("Free onboarding — auto-assign Bolna key failed", err, {
        action: "payment.free_onboarding.auto_assign_key",
        tenantId: input.tenantId,
      });
      // Non-fatal: key can be assigned later by admin
    }

    // 5. Credit included bonus balance
    if (effectiveTerms.includedBalance > 0) {
      await this.walletRepo.ensureWallet(input.tenantId);
      await this.walletRepo.credit({
        tenantId: input.tenantId,
        amount: effectiveTerms.includedBalance,
        type: "BONUS",
        targetBalance: "BONUS",
        description: input.waiverReason
          ? `Plan bonus — ${effectiveTerms.planName} (contract fee waiver)`
          : `Plan bonus — ${effectiveTerms.planName} (free onboarding)`,
        sourceType: "PLAN_BONUS",
        sourceId: tenantPlan.id,
        idempotencyKey: `plan_bonus:${tenantPlan.id}:${effectiveTerms.planVersionId}`,
        createdBy: input.adminUserId,
        bonusExpiresAt,
      });
    }

    this.logger.info("Free onboarding activated", {
      action: "payment.free_onboarding",
      tenantId: input.tenantId,
      planVersionId: effectiveTerms.planVersionId,
      includedBalancePaisa: effectiveTerms.includedBalance,
      adminUserId: input.adminUserId,
      feeWaived: effectiveTerms.onboardingFee > 0,
      waiverReason: input.waiverReason ?? null,
    });

    return {
      tenantId: input.tenantId,
      planVersionId: effectiveTerms.planVersionId,
      includedBalance: effectiveTerms.includedBalance,
      bonusExpiresAt: bonusExpiresAt?.toISOString() ?? null,
    };
  }
}