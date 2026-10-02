import type { PlanRepository } from "../interfaces/plan-repository.interface";
import { PlanVersionNotFoundError } from "../../domain/errors/plan.errors";

export interface ActivateTenantPlanInput {
  tenantId: string;
  planVersionId: string;
  createdBy?: string;
}

export interface ActivateTenantPlanOutput {
  tenantId: string;
  planVersionId: string;
  bonusExpiresAt: Date | null;
  includedBalance: number;
}

/**
 * Called after successful onboarding payment or Enterprise free activation.
 * Activates TenantPlan, computes bonus expiry, and returns bonus info for wallet crediting.
 */
export class ActivateTenantPlanUseCase {
  constructor(private readonly planRepo: PlanRepository) {}

  async execute(
    input: ActivateTenantPlanInput,
  ): Promise<ActivateTenantPlanOutput> {
    const version = await this.planRepo.findVersionById(input.planVersionId);
    if (!version) throw new PlanVersionNotFoundError(input.planVersionId);

    const bonusExpiresAt = version.bonusValidityDays
      ? new Date(Date.now() + version.bonusValidityDays * 24 * 60 * 60 * 1000)
      : null;

    await this.planRepo.activatePlan(
      input.tenantId,
      input.planVersionId,
      bonusExpiresAt,
      input.createdBy,
    );

    return {
      tenantId: input.tenantId,
      planVersionId: input.planVersionId,
      bonusExpiresAt,
      includedBalance: version.includedBalance,
    };
  }
}
