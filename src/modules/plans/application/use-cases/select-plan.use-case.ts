import type { PlanRepository } from "../interfaces/plan-repository.interface";
import {
  PlanNotFoundError,
  TenantPlanAlreadyActiveError,
} from "../../domain/errors/plan.errors";
import type { TenantPlan } from "@prisma/client";

export class SelectPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(tenantId: string, planId: string): Promise<TenantPlan> {
    // 1. Verify the plan exists and is available for selection
    const plan = await this.planRepo.findById(planId);
    if (!plan || !plan.isActive) {
      throw new PlanNotFoundError(planId);
    }

    // 2. Guard: tenant already has an ACTIVE plan → must use upgrade flow
    const existing = await this.planRepo.getActivePlanForTenant(tenantId);
    if (existing && existing.status === "ACTIVE") {
      throw new TenantPlanAlreadyActiveError();
    }

    // 3. Upsert TenantPlan as PENDING_PAYMENT
    //    - Creates a new row if the tenant has no plan yet (self-registration)
    //    - Updates planId + resets status if they had a previous PENDING / EXPIRED row
    const tenantPlan = await this.planRepo.selectPlan(tenantId, planId);

    return tenantPlan;
  }
}
