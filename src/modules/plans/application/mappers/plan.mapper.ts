import type { Plan, PlanVersion, TenantPlan } from "@prisma/client";
import type {
  PlanResponse,
  PlanDetailResponse,
  PlanVersionResponse,
  TenantPlanResponse,
} from "../dto/plan.dto";
import {
  resolveEffectiveTerms,
  type EffectivePlanTerms,
} from "../../domain/entities/plan.entity";

export function toPlanVersionResponse(v: PlanVersion): PlanVersionResponse {
  return {
    id: v.id,
    planId: v.planId,
    version: v.version,
    status: v.status,
    currency: v.currency,

    pricingModel: v.pricingModel,
    onboardingFee: v.onboardingFee,
    onboardingFeeOriginal: v.onboardingFeeOriginal,
    perMinuteRate: v.perMinuteRate,
    billingMinimumSec: v.billingMinimumSec,
    billingIncrementSec: v.billingIncrementSec,

    maxActiveCampaigns: v.maxActiveCampaigns,
    maxLeadsPerBatch: v.maxLeadsPerBatch,
    maxAgents: v.maxAgents,
    maxTeamMembers: v.maxTeamMembers,
    retryAutomation: v.retryAutomation,
    industryPackLimit: v.industryPackLimit,

    callingChannel: v.callingChannel,
    brochureUpload: v.brochureUpload,

    dashboardTier: v.dashboardTier,
    agentCapability: v.agentCapability,
    integrations: v.integrations,
    supportTier: v.supportTier,

    lowBalanceThreshold: v.lowBalanceThreshold,
    includedBalance: v.includedBalance,
    bonusValidityDays: v.bonusValidityDays,

    publishedAt: v.publishedAt?.toISOString() ?? null,
    archivedAt: v.archivedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export function toPlanResponse(
  plan: Plan & { versions?: PlanVersion[] },
): PlanResponse {
  const publishedVersion =
    plan.versions?.find((v) => v.status === "PUBLISHED") ??
    plan.versions?.[0] ??
    null;

  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    isActive: plan.isActive,
    displayOrder: plan.displayOrder,
    description: plan.description,
    currentVersion: publishedVersion
      ? toPlanVersionResponse(publishedVersion)
      : null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toPlanDetailResponse(
  plan: Plan & { versions: PlanVersion[] },
): PlanDetailResponse {
  const base = toPlanResponse(plan);
  return {
    ...base,
    versions: plan.versions.map(toPlanVersionResponse),
  };
}

export function toTenantPlanResponse(
  tenantPlan: TenantPlan & {
    plan: Plan;
    planVersion: PlanVersion;
  },
): TenantPlanResponse {
  const effectiveTerms: EffectivePlanTerms = resolveEffectiveTerms(
    tenantPlan.plan,
    tenantPlan.planVersion,
    {
      onboardingFeeOverride: tenantPlan.onboardingFeeOverride,
      perMinuteRateOverride: tenantPlan.perMinuteRateOverride,
    },
  );

  return {
    tenantId: tenantPlan.tenantId,
    status: tenantPlan.status,
    planId: tenantPlan.planId,
    planVersionId: tenantPlan.planVersionId,
    effectiveTerms,
    overrides: {
      onboardingFeeOverride: tenantPlan.onboardingFeeOverride,
      perMinuteRateOverride: tenantPlan.perMinuteRateOverride,
    },
    activatedAt: tenantPlan.activatedAt?.toISOString() ?? null,
    bonusExpiresAt: tenantPlan.bonusExpiresAt?.toISOString() ?? null,
    createdAt: tenantPlan.createdAt.toISOString(),
    updatedAt: tenantPlan.updatedAt.toISOString(),
  };
}
