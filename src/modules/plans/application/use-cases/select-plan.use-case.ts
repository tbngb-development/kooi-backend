import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { TenantPlan } from "@prisma/client";
import {
  PlanNotFoundError,
  TenantPlanAlreadyActiveError,
  CustomPlanSelectionNotAllowedError,
  NoPublishedPlanVersionError,
} from "../../domain/errors/plan.errors";

export class SelectPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

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
      throw new TenantPlanAlreadyActiveError();
    }

    return this.planRepo.selectPlan(
      tenantId,
      plan.id,
      latestPublished.id,
      userId,
    );
  }
}
