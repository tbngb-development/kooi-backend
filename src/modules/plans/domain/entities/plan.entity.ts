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

// ── Composable Plan Configuration Traits ────────────────────────────────────

export interface PlanCommercials {
  pricingModel: PricingModel;
  onboardingFee: number; // in integer Paisa
  onboardingFeeOriginal: number | null;
  perMinuteRate: number; // in integer Paisa
  billingMinimumSec: number;
  billingIncrementSec: number;
}

export interface PlanLimits {
  maxActiveCampaigns: number | null;
  maxLeadsPerBatch: number | null;
  maxAgents: number | null;
  maxTeamMembers: number | null;
  retryAutomation: boolean;
  industryPackLimit: number | null;
}

export interface PlanCapabilities {
  callingChannel: CallingChannel;
  brochureUpload: boolean;
}

export interface PlanTiers {
  dashboardTier: DashboardTier;
  agentCapability: AgentCapability;
  integrations: IntegrationTier;
  supportTier: SupportTier;
}

export interface PlanWalletConfig {
  lowBalanceThreshold: number;
  includedBalance: number;
  bonusValidityDays: number | null;
}

export type PlanVersionConfig = PlanCommercials &
  PlanLimits &
  PlanCapabilities &
  PlanTiers &
  PlanWalletConfig;

// ── Domain Entities ──────────────────────────────────────────────────────────

export interface PlanVersionEntity extends PlanVersionConfig {
  id: string;
  planId: string;
  version: number;
  status: PlanVersionStatus;
  currency: string;
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

export interface PlanOverrides {
  onboardingFeeOverride?: number | null;
  perMinuteRateOverride?: number | null;
}

/**
 * Authoritative commercial and entitlement terms applied to a tenant.
 * Computed by applying TenantPlan overrides on top of the assigned PlanVersion defaults.
 */
export interface EffectivePlanTerms extends PlanVersionConfig {
  planId: string;
  planName: string;
  planSlug: string;
  planDisplayOrder: number;
  planVersionId: string;
  version: number;
  currency: string;
  isCustomPriced: boolean;
}

/**
 * Pure domain function to resolve effective commercial and feature terms.
 */
export function resolveEffectiveTerms(
  plan: Pick<PlanEntity, "id" | "name" | "slug" | "displayOrder">,
  version: PlanVersionEntity,
  overrides?: PlanOverrides,
): EffectivePlanTerms {
  const effectiveOnboardingFee =
    overrides?.onboardingFeeOverride ?? version.onboardingFee;
  const effectivePerMinuteRate =
    overrides?.perMinuteRateOverride ?? version.perMinuteRate;

  const hasOverrides =
    overrides?.onboardingFeeOverride != null ||
    overrides?.perMinuteRateOverride != null;

  const isCustomPriced = hasOverrides || version.pricingModel === "CUSTOM";

  return {
    planId: plan.id,
    planName: plan.name,
    planSlug: plan.slug,
    planDisplayOrder: plan.displayOrder,
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
