import type { PlanVersionStatus, TenantPlanStatus } from "@prisma/client";
import type {
  PlanVersionConfig,
  EffectivePlanTerms,
} from "../../domain/entities/plan.entity";

export interface PlanVersionResponse extends PlanVersionConfig {
  id: string;
  planId: string;
  version: number;
  status: PlanVersionStatus;
  currency: string;
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

export type CreatePlanVersionInput = Partial<PlanVersionConfig> & {
  onboardingFee: number;
  perMinuteRate: number;
};

export type CreatePlanInput = CreatePlanVersionInput & {
  name: string;
  slug: string;
  displayOrder?: number;
  description?: string | null;
  publishImmediately?: boolean;
};

export interface UpdatePlanInput {
  name?: string;
  displayOrder?: number;
  isActive?: boolean;
  description?: string | null;
}

export interface UpdatePlanOverridesInput {
  onboardingFeeOverride?: number | null;
  perMinuteRateOverride?: number | null;
}

export interface ChangePlanInput {
  newPlanId: string;
}

export type PlanChangeDirection = "UPGRADE" | "DOWNGRADE" | "LATERAL";

export interface ChangePlanResponse {
  tenantId: string;
  previousPlanVersionId: string;
  newPlanVersionId: string;
  direction: PlanChangeDirection;
  onboardingFeeDifference: number;
  requiresPayment: boolean;
  effectiveImmediately: boolean;
}
