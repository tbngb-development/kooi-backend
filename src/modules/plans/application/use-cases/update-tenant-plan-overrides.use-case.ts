import type { PlanRepository } from "../interfaces/plan-repository.interface";
import type {
  UpdatePlanOverridesInput,
  TenantPlanResponse,
} from "../dto/plan.dto";
import { TenantPlanNotFoundError } from "../../domain/errors/plan.errors";
import { toTenantPlanResponse } from "../mappers/plan.mapper";

export class UpdateTenantPlanOverridesUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(
    tenantId: string,
    overrides: UpdatePlanOverridesInput,
    adminUserId?: string,
  ): Promise<TenantPlanResponse> {
    const existing = await this.planRepo.getTenantPlan(tenantId);
    if (!existing) throw new TenantPlanNotFoundError(tenantId);

    await this.planRepo.updateOverrides(tenantId, overrides, adminUserId);

    const updated = await this.planRepo.getTenantPlan(tenantId);
    return toTenantPlanResponse(updated!);
  }
}
