import type {
  Plan,
  PlanVersion,
  TenantPlan,
  TenantPlanStatus,
} from "@prisma/client";
import type {
  CreatePlanInput,
  UpdatePlanInput,
  CreatePlanVersionInput,
  UpdatePlanOverridesInput,
} from "../dto/plan.dto";
import type { EffectivePlanTerms } from "../../domain/entities/plan.entity";

export type TenantActivePlan = EffectivePlanTerms & {
  tenantPlanId: string;
  tenantId: string;
  status: TenantPlanStatus;
  activatedAt: Date | null;
  bonusExpiresAt: Date | null;
};

export interface PlanRepository {
  // ── Plan Metadata ─────────────────────────────────────────────
  create(input: CreatePlanInput): Promise<Plan & { versions: PlanVersion[] }>;
  update(id: string, input: UpdatePlanInput): Promise<Plan>;
  findById(id: string): Promise<(Plan & { versions: PlanVersion[] }) | null>;
  findBySlug(
    slug: string,
  ): Promise<(Plan & { versions: PlanVersion[] }) | null>;
  listActive(): Promise<Array<Plan & { versions: PlanVersion[] }>>;
  listAll(): Promise<Array<Plan & { versions: PlanVersion[] }>>;

  // ── Plan Versions ─────────────────────────────────────────────
  findVersionById(versionId: string): Promise<PlanVersion | null>;
  findLatestPublishedVersion(planId: string): Promise<PlanVersion | null>;
  createVersion(
    planId: string,
    input: CreatePlanVersionInput,
  ): Promise<PlanVersion>;
  publishVersion(versionId: string): Promise<PlanVersion>;
  archiveVersion(versionId: string): Promise<PlanVersion>;

  // ── Tenant Plans ──────────────────────────────────────────────
  getActivePlanForTenant(tenantId: string): Promise<TenantActivePlan | null>;
  getTenantPlan(
    tenantId: string,
  ): Promise<(TenantPlan & { plan: Plan; planVersion: PlanVersion }) | null>;
  selectPlan(
    tenantId: string,
    planId: string,
    planVersionId: string,
    createdBy?: string,
  ): Promise<TenantPlan>;
  activatePlan(
    tenantId: string,
    planVersionId: string,
    bonusExpiresAt: Date | null,
    createdBy?: string,
  ): Promise<TenantPlan>;
  updateOverrides(
    tenantId: string,
    overrides: UpdatePlanOverridesInput,
    createdBy?: string,
  ): Promise<TenantPlan>;
  updateStatus(
    tenantId: string,
    status: TenantPlanStatus,
    createdBy?: string,
  ): Promise<void>;

  // ── Enforcement Counts ────────────────────────────────────────
  countActiveCampaigns(tenantId: string): Promise<number>;
  countRunningCampaigns(tenantId: string): Promise<number>;

  countConcurrentCampaignsAtTime(
    tenantId: string,
    targetTime: Date,
    excludeCampaignId?: string,
    windowMinutes?: number,
  ): Promise<number>;
  countAgents(tenantId: string): Promise<number>;
  countTeamMembers(tenantId: string): Promise<number>;
}
