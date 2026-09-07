import type { Plan } from "@prisma/client";
import type { PlanResponse } from "../dto/plan.dto";
import type { PlanFeatures } from "../../domain/entities/plan.entity";

export function toPlanResponse(plan: Plan): PlanResponse {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    isActive: plan.isActive,
    displayOrder: plan.displayOrder,
    onboardingFee: plan.onboardingFee,
    perMinuteRate: plan.perMinuteRate,
    billingMinimumSec: plan.billingMinimumSec,
    billingIncrementSec: plan.billingIncrementSec,
    maxActiveCampaigns: plan.maxActiveCampaigns,
    maxLeadsPerBatch: plan.maxLeadsPerBatch,
    retryAutomation: plan.retryAutomation,
    industryPackLimit: plan.industryPackLimit,
    features: plan.features as unknown as PlanFeatures,
    includedBalance: plan.includedBalance,
    bonusValidityDays: plan.bonusValidityDays,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
