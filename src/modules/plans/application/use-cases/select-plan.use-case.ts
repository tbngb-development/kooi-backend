import type { PlanRepository } from "../interfaces/plan-repository.interface";
import {
  PlanNotFoundError,
  TenantPlanAlreadyActiveError,
  CustomPlanSelectionNotAllowedError,
} from "../../domain/errors/plan.errors";
import type { TenantPlan } from "@prisma/client";

export class SelectPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(tenantId: string, planId: string): Promise<TenantPlan> {
    const plan = await this.planRepo.findById(planId);
    if (!plan || !plan.isActive) {
      throw new PlanNotFoundError(planId);
    }

    // Block self-selection of custom/enterprise plans
    if (plan.pricingModel === "CUSTOM") {
      throw new CustomPlanSelectionNotAllowedError();
    }

    // Guard: tenant already has an ACTIVE plan → must use upgrade flow
    const existing = await this.planRepo.getActivePlanForTenant(tenantId);
    if (existing && existing.status === "ACTIVE") {
      throw new TenantPlanAlreadyActiveError();
    }

    // Allow switching while PENDING_PAYMENT (cart-like flexibility)
    const tenantPlan = await this.planRepo.selectPlan(tenantId, planId);

    return tenantPlan;
  }
}
