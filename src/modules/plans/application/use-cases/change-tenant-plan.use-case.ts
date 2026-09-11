import type { PlanRepository } from "../interfaces/plan-repository.interface";
import {
  TenantPlanNotFoundError,
  PlanNotFoundError,
  PlanNotActiveError,
  NoPublishedPlanVersionError,
} from "../../domain/errors/plan.errors";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";

export type PlanChangeDirection = "UPGRADE" | "DOWNGRADE" | "LATERAL";

export interface ChangeTenantPlanInput {
  tenantId: string;
  newPlanId: string;
  initiatedBy: string; // userId or "admin"
  skipOnboardingFeeDiff?: boolean; // admin override
}

export interface ChangeTenantPlanResult {
  tenantId: string;
  previousPlanVersionId: string;
  newPlanVersionId: string;
  direction: PlanChangeDirection;
  onboardingFeeDifference: number; // paisa; 0 if no additional charge
  requiresPayment: boolean;
  effectiveImmediately: boolean;
}

/**
 * Handles tenant plan changes (upgrade, downgrade, lateral).
 *
 * Business Rules:
 *  1. Tenant must have an ACTIVE plan to change.
 *  2. New plan must have a PUBLISHED version.
 *  3. Custom/Enterprise plans cannot be self-selected.
 *  4. Onboarding fee difference:
 *     - Upgrade (new fee > old fee): tenant pays the difference
 *     - Downgrade/Lateral: no refund, no additional charge
 *  5. Wallet balance carries over unchanged.
 *  6. Existing bonus is NOT clawed back.
 *  7. New plan's bonus is NOT granted (one-time onboarding bonus only).
 *  8. New per-minute rate and limits take effect immediately upon activation.
 *  9. Downgrades require admin approval (skipOnboardingFeeDiff = true by admin).
 */
export class ChangeTenantPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(input: ChangeTenantPlanInput): Promise<ChangeTenantPlanResult> {
    // 1. Validate current tenant plan
    const currentPlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!currentPlan) {
      throw new TenantPlanNotFoundError(input.tenantId);
    }
    if (currentPlan.status !== "ACTIVE") {
      throw new PlanNotActiveError();
    }

    // 2. Validate new plan
    const newPlan = await this.planRepo.findById(input.newPlanId);
    if (!newPlan || !newPlan.isActive) {
      throw new PlanNotFoundError(input.newPlanId);
    }

    const newVersion = await this.planRepo.findLatestPublishedVersion(
      input.newPlanId,
    );
    if (!newVersion) {
      throw new NoPublishedPlanVersionError(newPlan.name);
    }

    // 3. Block self-service for Custom/Enterprise
    if (newVersion.pricingModel === "CUSTOM" && !input.skipOnboardingFeeDiff) {
      throw new AppError(
        HttpStatus.FORBIDDEN,
        "Enterprise plans require admin activation.",
        "CUSTOM_PLAN_REQUIRES_ADMIN",
      );
    }

    // 4. Prevent no-op changes
    if (currentPlan.planVersionId === newVersion.id) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Tenant is already on this plan version.",
        "SAME_PLAN_VERSION",
      );
    }

    // 5. Determine direction
    const direction = this.determineDirection(
      currentPlan.onboardingFee,
      newVersion.onboardingFee,
    );

    // 6. Calculate onboarding fee difference
    let onboardingFeeDifference = 0;
    let requiresPayment = false;

    if (direction === "UPGRADE" && !input.skipOnboardingFeeDiff) {
      onboardingFeeDifference = Math.max(
        0,
        newVersion.onboardingFee - currentPlan.onboardingFee,
      );
      requiresPayment = onboardingFeeDifference > 0;
    }

    // 7. If payment is required, don't activate yet — return info for payment flow
    if (requiresPayment) {
      return {
        tenantId: input.tenantId,
        previousPlanVersionId: currentPlan.planVersionId,
        newPlanVersionId: newVersion.id,
        direction,
        onboardingFeeDifference,
        requiresPayment: true,
        effectiveImmediately: false,
      };
    }

    // 8. Activate the new plan version immediately
    await this.planRepo.activatePlan(
      input.tenantId,
      newVersion.id,
      currentPlan.bonusExpiresAt, // preserve existing bonus expiry
      input.initiatedBy,
    );

    return {
      tenantId: input.tenantId,
      previousPlanVersionId: currentPlan.planVersionId,
      newPlanVersionId: newVersion.id,
      direction,
      onboardingFeeDifference: 0,
      requiresPayment: false,
      effectiveImmediately: true,
    };
  }

  private determineDirection(
    currentFee: number,
    newFee: number,
  ): PlanChangeDirection {
    if (newFee > currentFee) return "UPGRADE";
    if (newFee < currentFee) return "DOWNGRADE";
    return "LATERAL";
  }
}
