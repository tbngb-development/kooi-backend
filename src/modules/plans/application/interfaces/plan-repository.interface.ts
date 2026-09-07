import type {
  Plan,
  PlanStatus,
  TenantPlan,
} from "@prisma/client";
import type { CreatePlanInput, UpdatePlanInput } from "../dto/plan.dto";

export type TenantActivePlan = Plan & {
  status: PlanStatus;
  activatedAt: Date | null;
  bonusExpiresAt: Date | null;
};

export interface PlanRepository {
  // ── Plans (Admin) ─────────────────────────────────────────────
  create(input: CreatePlanInput): Promise<Plan>;
  update(id: string, input: UpdatePlanInput): Promise<Plan>;
  findById(id: string): Promise<Plan | null>;
  findBySlug(slug: string): Promise<Plan | null>;
  listActive(): Promise<Plan[]>;
  listAll(): Promise<Plan[]>;

  // ── Tenant Plans ──────────────────────────────────────────────
  getActivePlanForTenant(tenantId: string): Promise<TenantActivePlan | null>;

  /** Upsert a TenantPlan row with PENDING_PAYMENT status. */
  selectPlan(tenantId: string, planId: string): Promise<TenantPlan>;
  // ───────────────────────────────────────────────────────────────

  activatePlan(
    tenantId: string,
    planId: string,
    bonusExpiresAt: Date | null,
  ): Promise<TenantPlan>;
  updateStatus(tenantId: string, status: PlanStatus): Promise<void>;

  // ── Enforcement Queries ───────────────────────────────────────
  countActiveCampaigns(tenantId: string): Promise<number>;
}
