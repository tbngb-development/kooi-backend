import type { Plan } from "@prisma/client";
import type { PlanResponse } from "../dto/plan.dto";

export function toPlanResponse(plan: Plan): PlanResponse {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    isActive: plan.isActive,
    displayOrder: plan.displayOrder,

    pricingModel: plan.pricingModel,
    onboardingFee: plan.onboardingFee,
    onboardingFeeOriginal: plan.onboardingFeeOriginal,
    perMinuteRate: plan.perMinuteRate,
    billingMinimumSec: plan.billingMinimumSec,
    billingIncrementSec: plan.billingIncrementSec,

    maxActiveCampaigns: plan.maxActiveCampaigns,
    maxLeadsPerBatch: plan.maxLeadsPerBatch,
    maxAgents: plan.maxAgents,
    maxTeamMembers: plan.maxTeamMembers,
    retryAutomation: plan.retryAutomation,
    industryPackLimit: plan.industryPackLimit,

    callingChannel: plan.callingChannel,
    brochureUpload: plan.brochureUpload,

    dashboardTier: plan.dashboardTier,
    agentCapability: plan.agentCapability,
    integrations: plan.integrations,
    supportTier: plan.supportTier,

    lowBalanceThreshold: plan.lowBalanceThreshold,
    includedBalance: plan.includedBalance,
    bonusValidityDays: plan.bonusValidityDays,

    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
