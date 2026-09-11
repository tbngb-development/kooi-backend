import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { AutoAssignKeyUseCase } from "../../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { TenantEmailRepository } from "../interfaces/tenant-email-repository.interface";
import { paymentSuccessEmailHtml } from "../../../../shared/config/external/email/templates/payment-success.template";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import type { Recharge } from "@prisma/client";
import type {
  CompletePaymentInput,
  CompletePaymentResult,
} from "../dto/payment.dto";

/**
 * Completes a payment after Razorpay verification (manual or webhook).
 *
 * Idempotency:
 *  - If recharge is already SUCCESS, returns early (no double-credit).
 *  - Wallet credit uses idempotencyKey = `recharge:{rechargeId}`.
 *  - Plan activation is delegated to PlanRepository which is also idempotent.
 */
export class CompletePaymentUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly autoAssignKey: AutoAssignKeyUseCase,
    private readonly email: IEmailService,
    private readonly tenantEmailRepo: TenantEmailRepository,
  ) {}

  async execute(input: CompletePaymentInput): Promise<CompletePaymentResult> {
    // 1. Find recharge by Razorpay order ID
    const recharge = await this.rechargeRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );
    if (!recharge) throw new RechargeNotFoundError(input.razorpayOrderId);

    // 2. Idempotency: already processed
    if (recharge.status === "SUCCESS") {
      return {
        alreadyProcessed: true,
        rechargeId: recharge.id,
        purpose: recharge.purpose,
      };
    }

    // 3. Mark recharge as SUCCESS
    await this.rechargeRepo.markSuccess(
      recharge.id,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );

    // 4. Ensure wallet exists
    await this.walletRepo.ensureWallet(recharge.tenantId);

    // 5. Process based on purpose & presence of targetPlanVersionId
    if (recharge.purpose === "ONBOARDING") {
      await this.processOnboarding(recharge);
    } else {
      await this.processTopup(recharge);
    }

    // 6. Send receipt email (non-fatal)
    await this.sendReceipt(
      recharge.tenantId,
      recharge.amount,
      recharge.purpose,
    );

    return {
      alreadyProcessed: false,
      rechargeId: recharge.id,
      purpose: recharge.purpose,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────

  private async processOnboarding(recharge: Recharge): Promise<void> {
    if (!recharge.tenantPlanId) {
      console.error(
        `[Payment] ONBOARDING recharge ${recharge.id} has no tenantPlanId`,
      );
      return;
    }

    // If targetPlanVersionId exists, this is a Plan Upgrade
    if (recharge.targetPlanVersionId) {
      await this.processUpgrade(recharge, recharge.targetPlanVersionId);
    } else {
      await this.processInitialOnboarding(recharge);
    }
  }

  private async processInitialOnboarding(recharge: Recharge): Promise<void> {
    const effectiveTerms = await this.planRepo.getActivePlanForTenant(
      recharge.tenantId,
    );
    if (!effectiveTerms) {
      throw new TenantPlanNotFoundError(recharge.tenantId);
    }

    const bonusExpiresAt = effectiveTerms.bonusValidityDays
      ? new Date(
          Date.now() + effectiveTerms.bonusValidityDays * 24 * 60 * 60 * 1000,
        )
      : null;

    // Activate plan (PlanRepository creates TenantPlanEvent internally)
    await this.planRepo.activatePlan(
      recharge.tenantId,
      effectiveTerms.planVersionId,
      bonusExpiresAt,
      "razorpay-webhook",
    );

    // Auto-assign Bolna API key (non-fatal)
    try {
      await this.autoAssignKey.execute(recharge.tenantId);
    } catch (err) {
      console.error("[Payment] auto-assign Bolna key failed:", err);
    }

    // Credit initial plan bonus
    if (effectiveTerms.includedBalance > 0) {
      await this.walletRepo.credit({
        tenantId: recharge.tenantId,
        amount: effectiveTerms.includedBalance,
        type: "BONUS",
        targetBalance: "BONUS",
        description: `Plan bonus — ${effectiveTerms.planName}`,
        sourceType: "PLAN_BONUS",
        sourceId: recharge.tenantPlanId!,
        idempotencyKey: `plan_bonus:${recharge.tenantPlanId}:${effectiveTerms.planVersionId}`,
        createdBy: "razorpay-webhook",
        bonusExpiresAt,
      });
    }
  }

  private async processUpgrade(
    recharge: Recharge,
    targetVersionId: string,
  ): Promise<void> {
    // 1. Fetch current plan terms
    const currentTerms = await this.planRepo.getActivePlanForTenant(
      recharge.tenantId,
    );
    if (!currentTerms) {
      throw new TenantPlanNotFoundError(recharge.tenantId);
    }

    // 2. Fetch target plan version & parent plan
    const targetVersion = await this.planRepo.findVersionById(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target PlanVersion ${targetVersionId} not found`);
    }

    const targetPlan = await this.planRepo.findById(targetVersion.planId);
    const targetPlanName = targetPlan?.name ?? "Upgraded Plan";

    // 3. Compute new bonus expiration (extends validity from upgrade date)
    const bonusExpiresAt = targetVersion.bonusValidityDays
      ? new Date(
          Date.now() + targetVersion.bonusValidityDays * 24 * 60 * 60 * 1000,
        )
      : currentTerms.bonusExpiresAt;

    // 4. Activate the target PlanVersion (creates TenantPlanEvent: PLAN_CHANGED)
    await this.planRepo.activatePlan(
      recharge.tenantId,
      targetVersionId,
      bonusExpiresAt,
      "plan-upgrade-payment",
    );

    // 5. Calculate incremental promotional bonus
    const bonusDelta = Math.max(
      0,
      targetVersion.includedBalance - currentTerms.includedBalance,
    );

    // 6. Credit incremental bonus & generate WalletTransaction
    if (bonusDelta > 0) {
      await this.walletRepo.credit({
        tenantId: recharge.tenantId,
        amount: bonusDelta,
        type: "BONUS",
        targetBalance: "BONUS",
        description: `Plan upgrade bonus — ${currentTerms.planName} → ${targetPlanName}`,
        sourceType: "PLAN_BONUS",
        sourceId: recharge.id,
        idempotencyKey: `plan_upgrade_bonus:${recharge.id}:${targetVersionId}`,
        createdBy: "plan-upgrade-payment",
        bonusExpiresAt,
      });
    }

    console.log(
      `[Payment] Plan upgrade complete for tenant ${recharge.tenantId} to ${targetPlanName} (v${targetVersion.version}) | Bonus delta credited: ₹${(bonusDelta / 100).toFixed(2)}`,
    );
  }

  private async processTopup(recharge: Recharge): Promise<void> {
    await this.walletRepo.credit({
      tenantId: recharge.tenantId,
      amount: recharge.amount,
      type: "CREDIT",
      targetBalance: "CASH",
      description: `Wallet recharge — ₹${(recharge.amount / 100).toFixed(2)}`,
      sourceType: "RECHARGE",
      sourceId: recharge.id,
      idempotencyKey: `recharge:${recharge.id}`,
      createdBy: "razorpay-webhook",
    });
  }

  private async sendReceipt(
    tenantId: string,
    amountPaisa: number,
    purpose: string,
  ): Promise<void> {
    try {
      const email = await this.tenantEmailRepo.getEmailById(tenantId);
      if (!email) return;

      await this.email.send({
        to: email,
        subject: "KOOI — Payment Successful",
        html: paymentSuccessEmailHtml({
          tenantName: email.split("@")[0],
          amountPaisa,
          kind: purpose,
        }),
      });
    } catch (err) {
      console.error("[Payment] receipt email failed:", err);
    }
  }
}
