import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type { TenantPlanResponse } from "../dto/plan.dto";
import { TenantPlanNotFoundError } from "../../domain/errors/plan.errors";
import { toTenantPlanResponse } from "../mappers/plan.mapper";

export class GetTenantPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(tenantId: string): Promise<TenantPlanResponse> {
    const tenantPlan = await this.planRepo.getTenantPlan(tenantId);
    if (!tenantPlan) throw new TenantPlanNotFoundError(tenantId);

    return toTenantPlanResponse(tenantPlan);
  }
}
