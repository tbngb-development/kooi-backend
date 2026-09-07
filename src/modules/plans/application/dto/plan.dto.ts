import type { PlanStatus } from "@prisma/client";
import type { PlanFeatures } from "../../domain/entities/plan.entity";

export interface PlanResponse {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  onboardingFee: number;
  perMinuteRate: number;
  billingMinimumSec: number;
  billingIncrementSec: number;
  maxActiveCampaigns: number | null;
  maxLeadsPerBatch: number | null;
  retryAutomation: boolean;
  industryPackLimit: number | null;
  features: PlanFeatures;
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
  onboardingFee: number;
  perMinuteRate: number;
  billingMinimumSec?: number;
  billingIncrementSec?: number;
  maxActiveCampaigns?: number | null;
  maxLeadsPerBatch?: number | null;
  retryAutomation?: boolean;
  industryPackLimit?: number | null;
  features: PlanFeatures;
  includedBalance?: number;
  bonusValidityDays?: number | null;
}

export interface UpdatePlanInput {
  name?: string;
  displayOrder?: number;
  isActive?: boolean;
  onboardingFee?: number;
  perMinuteRate?: number;
  billingMinimumSec?: number;
  billingIncrementSec?: number;
  maxActiveCampaigns?: number | null;
  maxLeadsPerBatch?: number | null;
  retryAutomation?: boolean;
  industryPackLimit?: number | null;
  features?: PlanFeatures;
  includedBalance?: number;
  bonusValidityDays?: number | null;
}
