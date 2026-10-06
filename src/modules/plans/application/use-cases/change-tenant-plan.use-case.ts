import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { PlanChangeDirection, ChangePlanResponse } from "../dto/plan.dto";
import {
  TenantPlanNotFoundError,
  PlanNotFoundError,
  PlanNotActiveError,
  NoPublishedPlanVersionError,
} from "../../domain/errors/plan.errors";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";

export interface ChangeTenantPlanInput {
  tenantId: string;
  newPlanId: string;
  initiatedBy: string; // userId or "admin"
  skipOnboardingFeeDiff?: boolean; // admin override
}

export class ChangeTenantPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(input: ChangeTenantPlanInput): Promise<ChangePlanResponse> {
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

    // 2. Validate target plan
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

    // 5. Determine direction using plan hierarchy (displayOrder)
    const direction = this.determineDirection(
      currentPlan.planDisplayOrder,
      newPlan.displayOrder,
    );

    // 6. Calculate fee difference (Upgrade only)
    let onboardingFeeDifference = 0;
    let requiresPayment = false;

    if (direction === "UPGRADE" && !input.skipOnboardingFeeDiff) {
      onboardingFeeDifference = Math.max(
        0,
        newVersion.onboardingFee - currentPlan.onboardingFee,
      );
      requiresPayment = onboardingFeeDifference > 0;
    }

    // 7. If payment required, return settlement info for checkout
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

    // 8. Activate new plan version immediately (lateral, downgrade, or waived fee)
    await this.planRepo.activatePlan(
      input.tenantId,
      newVersion.id,
      currentPlan.bonusExpiresAt,
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
    currentOrder: number,
    newOrder: number,
  ): PlanChangeDirection {
    if (newOrder > currentOrder) return "UPGRADE";
    if (newOrder < currentOrder) return "DOWNGRADE";
    return "LATERAL";
  }
}
