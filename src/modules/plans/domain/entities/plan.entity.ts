import type {
  CallingChannel,
  DashboardTier,
  AgentCapability,
  IntegrationTier,
  SupportTier,
  PricingModel,
  PlanVersionStatus,
  TenantPlanStatus,
} from "@prisma/client";

/**
 * Authoritative commercial and entitlement terms applied to a tenant.
 * Computed by applying TenantPlan overrides on top of the assigned PlanVersion defaults.
 */
export interface EffectivePlanTerms {
  planId: string;
  planName: string;
  planSlug: string;
  planVersionId: string;
  version: number;
  currency: string;

  // Commercials (Integer Paisa)
  pricingModel: PricingModel;
  onboardingFee: number;
  onboardingFeeOriginal: number | null;
  perMinuteRate: number;
  billingMinimumSec: number;
  billingIncrementSec: number;

  // Limits (null = unlimited)
  maxActiveCampaigns: number | null;
  maxLeadsPerBatch: number | null;
  maxAgents: number | null;
  maxTeamMembers: number | null;
  retryAutomation: boolean;
  industryPackLimit: number | null;

  // Capabilities
  callingChannel: CallingChannel;
  brochureUpload: boolean;

  // Feature Tiers
  dashboardTier: DashboardTier;
  agentCapability: AgentCapability;
  integrations: IntegrationTier;
  supportTier: SupportTier;

  // Wallet / Thresholds
  lowBalanceThreshold: number;
  includedBalance: number;
  bonusValidityDays: number | null;

  // Overrides applied
  isCustomPriced: boolean;
}

export interface PlanVersionEntity {
  id: string;
  planId: string;
  version: number;
  status: PlanVersionStatus;
  currency: string;

  pricingModel: PricingModel;
  onboardingFee: number;
  onboardingFeeOriginal: number | null;
  perMinuteRate: number;
  billingMinimumSec: number;
  billingIncrementSec: number;

  maxActiveCampaigns: number | null;
  maxLeadsPerBatch: number | null;
  maxAgents: number | null;
  maxTeamMembers: number | null;
  retryAutomation: boolean;
  industryPackLimit: number | null;

  callingChannel: CallingChannel;
  brochureUpload: boolean;

  dashboardTier: DashboardTier;
  agentCapability: AgentCapability;
  integrations: IntegrationTier;
  supportTier: SupportTier;

  lowBalanceThreshold: number;
  includedBalance: number;
  bonusValidityDays: number | null;

  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanEntity {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  versions?: PlanVersionEntity[];
}

export interface TenantPlanEntity {
  id: string;
  tenantId: string;
  planId: string;
  planVersionId: string;
  status: TenantPlanStatus;
  onboardingFeeOverride: number | null;
  perMinuteRateOverride: number | null;
  activatedAt: Date | null;
  bonusExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pure domain function to resolve effective terms.
 */
export function resolveEffectiveTerms(
  plan: Pick<PlanEntity, "id" | "name" | "slug">,
  version: PlanVersionEntity,
  overrides?: {
    onboardingFeeOverride?: number | null;
    perMinuteRateOverride?: number | null;
  },
): EffectivePlanTerms {
  const effectiveOnboardingFee =
    overrides?.onboardingFeeOverride !== undefined &&
    overrides?.onboardingFeeOverride !== null
      ? overrides.onboardingFeeOverride
      : version.onboardingFee;

  const effectivePerMinuteRate =
    overrides?.perMinuteRateOverride !== undefined &&
    overrides?.perMinuteRateOverride !== null
      ? overrides.perMinuteRateOverride
      : version.perMinuteRate;

  const isCustomPriced =
    (overrides?.onboardingFeeOverride !== undefined &&
      overrides?.onboardingFeeOverride !== null) ||
    (overrides?.perMinuteRateOverride !== undefined &&
      overrides?.perMinuteRateOverride !== null) ||
    version.pricingModel === "CUSTOM";

  return {
    planId: plan.id,
    planName: plan.name,
    planSlug: plan.slug,
    planVersionId: version.id,
    version: version.version,
    currency: version.currency,

    pricingModel: version.pricingModel,
    onboardingFee: effectiveOnboardingFee,
    onboardingFeeOriginal: version.onboardingFeeOriginal,
    perMinuteRate: effectivePerMinuteRate,
    billingMinimumSec: version.billingMinimumSec,
    billingIncrementSec: version.billingIncrementSec,

    maxActiveCampaigns: version.maxActiveCampaigns,
    maxLeadsPerBatch: version.maxLeadsPerBatch,
    maxAgents: version.maxAgents,
    maxTeamMembers: version.maxTeamMembers,
    retryAutomation: version.retryAutomation,
    industryPackLimit: version.industryPackLimit,

    callingChannel: version.callingChannel,
    brochureUpload: version.brochureUpload,

    dashboardTier: version.dashboardTier,
    agentCapability: version.agentCapability,
    integrations: version.integrations,
    supportTier: version.supportTier,

    lowBalanceThreshold: version.lowBalanceThreshold,
    includedBalance: version.includedBalance,
    bonusValidityDays: version.bonusValidityDays,

    isCustomPriced,
  };
}
