import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { TenantPlan } from "@prisma/client";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { AutoAssignKeyUseCase } from "../../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  PlanNotFoundError,
  TenantPlanAlreadyActiveError,
  CustomPlanSelectionNotAllowedError,
  NoPublishedPlanVersionError,
} from "../../domain/errors/plan.errors";

export class SelectPlanUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo?: WalletRepository,
    private readonly autoAssignKey?: AutoAssignKeyUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(
    tenantId: string,
    planId: string,
    userId?: string,
  ): Promise<TenantPlan> {
    const plan = await this.planRepo.findById(planId);
    if (!plan || !plan.isActive) {
      throw new PlanNotFoundError(planId);
    }

    // Block self-selection of Custom/Enterprise plans
    const latestPublished =
      await this.planRepo.findLatestPublishedVersion(planId);
    if (!latestPublished) {
      throw new NoPublishedPlanVersionError(plan.name);
    }

    if (latestPublished.pricingModel === "CUSTOM") {
      throw new CustomPlanSelectionNotAllowedError();
    }

    const existing = await this.planRepo.getActivePlanForTenant(tenantId);
    if (existing && existing.status === "ACTIVE") {
      // Idempotency: if already active with this trial plan version, return existing
      if (
        latestPublished.isTrial &&
        existing.planVersionId === latestPublished.id
      ) {
        const current = await this.planRepo.getTenantPlan(tenantId);
        if (current) return current;
      }
      throw new TenantPlanAlreadyActiveError();
    }

    // ── TRIAL PLAN: Activate immediately without payment ─────────
    if (latestPublished.isTrial) {
      const bonusExpiresAt = latestPublished.bonusValidityDays
        ? new Date(
            Date.now() +
              latestPublished.bonusValidityDays * 24 * 60 * 60 * 1000,
          )
        : null;

      const activatedPlan = await this.planRepo.activatePlan(
        tenantId,
        latestPublished.id,
        bonusExpiresAt,
        userId,
      );

      // Auto-assign Bolna API key (non-fatal)
      if (this.autoAssignKey) {
        try {
          await this.autoAssignKey.execute(tenantId);
        } catch (err) {
          this.logger?.warn(
            "Trial plan activation — auto-assign Bolna key failed",
            {
              action: "plans.select_trial.auto_assign_key",
              tenantId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }

      // Ensure wallet exists and credit included bonus balance if > 0
      if (this.walletRepo) {
        try {
          await this.walletRepo.ensureWallet(tenantId);
          if (latestPublished.includedBalance > 0) {
            await this.walletRepo.credit({
              tenantId,
              amount: latestPublished.includedBalance,
              type: "BONUS",
              targetBalance: "BONUS",
              description: `Plan bonus balance — ${plan.name} (Free Trial)`,
              sourceType: "PLAN_BONUS",
            });
          }
        } catch (err) {
          this.logger?.error(
            "Trial plan activation — wallet provisioning failed",
            err,
            {
              action: "plans.select_trial.ensure_wallet",
              tenantId,
            },
          );
        }
      }

      this.logger?.info("Trial plan activated on workspace onboarding", {
        action: "plans.select_trial.activated",
        tenantId,
        planId: plan.id,
        planVersionId: latestPublished.id,
        validityDays: latestPublished.validityDays,
        expiresAt: activatedPlan.expiresAt?.toISOString() ?? null,
      });

      return activatedPlan;
    }

    // ── PAID PLAN: Set PENDING_PAYMENT for Razorpay checkout ─────
    return this.planRepo.selectPlan(
      tenantId,
      plan.id,
      latestPublished.id,
      userId,
    );
  }
}
