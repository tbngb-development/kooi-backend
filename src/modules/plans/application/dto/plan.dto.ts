import type {
  PlanStatus,
  PricingModel,
  CallingChannel,
  DashboardTier,
  AgentCapability,
  IntegrationTier,
  SupportTier,
} from "@prisma/client";

export interface PlanResponse {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;

  // Pricing
  pricingModel: PricingModel;
  onboardingFee: number;
  onboardingFeeOriginal: number | null;
  perMinuteRate: number;
  billingMinimumSec: number;
  billingIncrementSec: number;

  // Limits
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

  // Wallet / Threshold
  lowBalanceThreshold: number;
  includedBalance: number;
  bonusValidityDays: number | null;

  createdAt: string;
  updatedAt: string;
}

export interface TenantPlanResponse {
  planId: string;
  plan: PlanResponse;
  status: PlanStatus;
  activatedAt: string | null;
  bonusExpiresAt: string | null;
}

export interface CreatePlanInput {
  name: string;
  slug: string;
  displayOrder?: number;

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

export interface UpdatePlanInput {
  name?: string;
  displayOrder?: number;
  isActive?: boolean;

  pricingModel?: PricingModel;
  onboardingFee?: number;
  onboardingFeeOriginal?: number | null;
  perMinuteRate?: number;
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
