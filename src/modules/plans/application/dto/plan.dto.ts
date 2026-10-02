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
import type { EffectivePlanTerms } from "../../domain/entities/plan.entity";

export interface PlanVersionResponse {
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

  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanResponse {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  description: string | null;
  currentVersion: PlanVersionResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDetailResponse extends PlanResponse {
  versions: PlanVersionResponse[];
}

export interface TenantPlanResponse {
  tenantId: string;
  status: TenantPlanStatus;
  planId: string;
  planVersionId: string;
  effectiveTerms: EffectivePlanTerms;
  overrides: {
    onboardingFeeOverride: number | null;
    perMinuteRateOverride: number | null;
  };
  activatedAt: string | null;
  bonusExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanInput {
  name: string;
  slug: string;
  displayOrder?: number;
  description?: string | null;

  // Initial Version Configuration
  pricingModel?: PricingModel;
  onboardingFee: number;
  onboardingFeeOriginal?: number | null;
  perMinuteRate: number;
  billingMinimumSec?: number;
  billingIncrementSec?: number;

  maxActiveCampaigns?: number | null;
  maxLeadsPerBatch?: number | null;
  maxAgents?: number | null;
  maxTeamMembers?: number | null;
  retryAutomation?: boolean;
  industryPackLimit?: number | null;

  callingChannel?: CallingChannel;
  brochureUpload?: boolean;

  dashboardTier?: DashboardTier;
  agentCapability?: AgentCapability;
  integrations?: IntegrationTier;
  supportTier?: SupportTier;

  lowBalanceThreshold?: number;
  includedBalance?: number;
  bonusValidityDays?: number | null;

  publishImmediately?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  displayOrder?: number;
  isActive?: boolean;
  description?: string | null;
}

export interface CreatePlanVersionInput {
  pricingModel?: PricingModel;
  onboardingFee: number;
  onboardingFeeOriginal?: number | null;
  perMinuteRate: number;
  billingMinimumSec?: number;
  billingIncrementSec?: number;

  maxActiveCampaigns?: number | null;
  maxLeadsPerBatch?: number | null;
  maxAgents?: number | null;
  maxTeamMembers?: number | null;
  retryAutomation?: boolean;
  industryPackLimit?: number | null;

  callingChannel?: CallingChannel;
  brochureUpload?: boolean;

  dashboardTier?: DashboardTier;
  agentCapability?: AgentCapability;
  integrations?: IntegrationTier;
  supportTier?: SupportTier;

  lowBalanceThreshold?: number;
  includedBalance?: number;
  bonusValidityDays?: number | null;
}

export interface UpdatePlanOverridesInput {
  onboardingFeeOverride?: number | null;
  perMinuteRateOverride?: number | null;
}

export interface ChangePlanInput {
  newPlanId: string;
}

export interface ChangePlanResponse {
  tenantId: string;
  previousPlanVersionId: string;
  newPlanVersionId: string;
  direction: "UPGRADE" | "DOWNGRADE" | "LATERAL";
  onboardingFeeDifference: number;
  requiresPayment: boolean;
  effectiveImmediately: boolean;
}
