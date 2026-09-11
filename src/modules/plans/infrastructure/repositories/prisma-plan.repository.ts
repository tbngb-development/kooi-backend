import prisma from "../../../../shared/config/database/prisma";
import type {
  Plan,
  PlanVersion,
  TenantPlan,
  TenantPlanStatus,
} from "@prisma/client";
import type {
  PlanRepository,
  TenantActivePlan,
} from "../../application/interfaces/plan-repository.interface";
import type {
  CreatePlanInput,
  UpdatePlanInput,
  CreatePlanVersionInput,
  UpdatePlanOverridesInput,
} from "../../application/dto/plan.dto";
import { resolveEffectiveTerms } from "../../domain/entities/plan.entity";
import { PlanVersionImmutableError } from "../../domain/errors/plan.errors";

export class PrismaPlanRepository implements PlanRepository {
  // ── Plan Metadata (Admin) ─────────────────────────────────────

  async create(
    input: CreatePlanInput,
  ): Promise<Plan & { versions: PlanVersion[] }> {
    return prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          name: input.name,
          slug: input.slug,
          displayOrder: input.displayOrder ?? 0,
          description: input.description ?? null,
        },
      });

      const initialStatus = input.publishImmediately ? "PUBLISHED" : "DRAFT";
      const version = await tx.planVersion.create({
        data: {
          planId: plan.id,
          version: 1,
          status: initialStatus,
          currency: "INR",

          pricingModel: input.pricingModel ?? "STANDARD",
          onboardingFee: input.onboardingFee,
          onboardingFeeOriginal: input.onboardingFeeOriginal ?? null,
          perMinuteRate: input.perMinuteRate,
          billingMinimumSec: input.billingMinimumSec ?? 30,
          billingIncrementSec: input.billingIncrementSec ?? 15,

          maxActiveCampaigns: input.maxActiveCampaigns ?? null,
          maxLeadsPerBatch: input.maxLeadsPerBatch ?? null,
          maxAgents: input.maxAgents ?? null,
          maxTeamMembers: input.maxTeamMembers ?? null,
          retryAutomation: input.retryAutomation ?? false,
          industryPackLimit: input.industryPackLimit ?? null,

          callingChannel: input.callingChannel ?? "SHARED",
          brochureUpload: input.brochureUpload ?? false,

          dashboardTier: input.dashboardTier ?? "BASIC",
          agentCapability: input.agentCapability ?? "BASIC",
          integrations: input.integrations ?? "NONE",
          supportTier: input.supportTier ?? "STANDARD",

          lowBalanceThreshold: input.lowBalanceThreshold ?? 10000,
          includedBalance: input.includedBalance ?? 0,
          bonusValidityDays: input.bonusValidityDays ?? null,
          publishedAt: input.publishImmediately ? new Date() : null,
        },
      });

      return {
        ...plan,
        versions: [version],
      };
    });
  }

  async update(id: string, input: UpdatePlanInput): Promise<Plan> {
    return prisma.plan.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.displayOrder !== undefined && {
          displayOrder: input.displayOrder,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
      },
    });
  }

  async findById(
    id: string,
  ): Promise<(Plan & { versions: PlanVersion[] }) | null> {
    return prisma.plan.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
    });
  }

  async findBySlug(
    slug: string,
  ): Promise<(Plan & { versions: PlanVersion[] }) | null> {
    return prisma.plan.findUnique({
      where: { slug },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
    });
  }

  async listActive(): Promise<Array<Plan & { versions: PlanVersion[] }>> {
    return prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
  }

  async listAll(): Promise<Array<Plan & { versions: PlanVersion[] }>> {
    return prisma.plan.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
    });
  }

  // ── Plan Versions ─────────────────────────────────────────────

  async findVersionById(versionId: string): Promise<PlanVersion | null> {
    return prisma.planVersion.findUnique({ where: { id: versionId } });
  }

  async findLatestPublishedVersion(
    planId: string,
  ): Promise<PlanVersion | null> {
    return prisma.planVersion.findFirst({
      where: { planId, status: "PUBLISHED" },
      orderBy: { version: "desc" },
    });
  }

  async createVersion(
    planId: string,
    input: CreatePlanVersionInput,
  ): Promise<PlanVersion> {
    return prisma.$transaction(async (tx) => {
      const latest = await tx.planVersion.findFirst({
        where: { planId },
        orderBy: { version: "desc" },
      });

      const nextVersionNum = (latest?.version ?? 0) + 1;

      return tx.planVersion.create({
        data: {
          planId,
          version: nextVersionNum,
          status: "DRAFT",
          currency: "INR",

          pricingModel: input.pricingModel ?? "STANDARD",
          onboardingFee: input.onboardingFee,
          onboardingFeeOriginal: input.onboardingFeeOriginal ?? null,
          perMinuteRate: input.perMinuteRate,
          billingMinimumSec: input.billingMinimumSec ?? 30,
          billingIncrementSec: input.billingIncrementSec ?? 15,

          maxActiveCampaigns: input.maxActiveCampaigns ?? null,
          maxLeadsPerBatch: input.maxLeadsPerBatch ?? null,
          maxAgents: input.maxAgents ?? null,
          maxTeamMembers: input.maxTeamMembers ?? null,
          retryAutomation: input.retryAutomation ?? false,
          industryPackLimit: input.industryPackLimit ?? null,

          callingChannel: input.callingChannel ?? "SHARED",
          brochureUpload: input.brochureUpload ?? false,

          dashboardTier: input.dashboardTier ?? "BASIC",
          agentCapability: input.agentCapability ?? "BASIC",
          integrations: input.integrations ?? "NONE",
          supportTier: input.supportTier ?? "STANDARD",

          lowBalanceThreshold: input.lowBalanceThreshold ?? 10000,
          includedBalance: input.includedBalance ?? 0,
          bonusValidityDays: input.bonusValidityDays ?? null,
        },
      });
    });
  }

  async publishVersion(versionId: string): Promise<PlanVersion> {
    return prisma.$transaction(async (tx) => {
      const v = await tx.planVersion.findUnique({ where: { id: versionId } });
      if (!v) throw new Error("Plan version not found");
      if (v.status === "ARCHIVED") {
        throw new PlanVersionImmutableError(v.status);
      }

      // Archive previous published versions of the same plan
      await tx.planVersion.updateMany({
        where: {
          planId: v.planId,
          status: "PUBLISHED",
          id: { not: versionId },
        },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
        },
      });

      return tx.planVersion.update({
        where: { id: versionId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    });
  }

  async archiveVersion(versionId: string): Promise<PlanVersion> {
    return prisma.planVersion.update({
      where: { id: versionId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });
  }

  // ── Tenant Plans ──────────────────────────────────────────────

  async getActivePlanForTenant(
    tenantId: string,
  ): Promise<TenantActivePlan | null> {
    const tenantPlan = await prisma.tenantPlan.findUnique({
      where: { tenantId },
      include: {
        plan: true,
        planVersion: true,
      },
    });

    if (!tenantPlan) return null;

    const terms = resolveEffectiveTerms(
      tenantPlan.plan,
      tenantPlan.planVersion,
      {
        onboardingFeeOverride: tenantPlan.onboardingFeeOverride,
        perMinuteRateOverride: tenantPlan.perMinuteRateOverride,
      },
    );

    return {
      ...terms,
      tenantPlanId: tenantPlan.id,
      tenantId: tenantPlan.tenantId,
      status: tenantPlan.status,
      activatedAt: tenantPlan.activatedAt,
      bonusExpiresAt: tenantPlan.bonusExpiresAt,
    };
  }

  async getTenantPlan(
    tenantId: string,
  ): Promise<(TenantPlan & { plan: Plan; planVersion: PlanVersion }) | null> {
    return prisma.tenantPlan.findUnique({
      where: { tenantId },
      include: {
        plan: true,
        planVersion: true,
      },
    });
  }

  async selectPlan(
    tenantId: string,
    planId: string,
    planVersionId: string,
    createdBy?: string,
  ): Promise<TenantPlan> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.tenantPlan.findUnique({
        where: { tenantId },
      });

      const tenantPlan = await tx.tenantPlan.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId,
          planVersionId,
          status: "PENDING_PAYMENT",
        },
        update: {
          planId,
          planVersionId,
          status: "PENDING_PAYMENT",
          activatedAt: null,
          bonusExpiresAt: null,
        },
      });

      await tx.tenantPlanEvent.create({
        data: {
          tenantPlanId: tenantPlan.id,
          tenantId,
          type: existing ? "PLAN_CHANGED" : "CREATED",
          fromPlanVersionId: existing?.planVersionId ?? null,
          toPlanVersionId: planVersionId,
          createdBy: createdBy ?? null,
          metadata: {
            reason: existing
              ? "Tenant changed selected plan"
              : "Initial plan selection",
          },
        },
      });

      return tenantPlan;
    });
  }

  async activatePlan(
    tenantId: string,
    planVersionId: string,
    bonusExpiresAt: Date | null,
    createdBy?: string,
  ): Promise<TenantPlan> {
    return prisma.$transaction(async (tx) => {
      const planVersion = await tx.planVersion.findUnique({
        where: { id: planVersionId },
      });
      if (!planVersion) throw new Error("PlanVersion not found");

      const tenantPlan = await tx.tenantPlan.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId: planVersion.planId,
          planVersionId,
          status: "ACTIVE",
          activatedAt: new Date(),
          bonusExpiresAt,
        },
        update: {
          planId: planVersion.planId,
          planVersionId,
          status: "ACTIVE",
          activatedAt: new Date(),
          bonusExpiresAt,
        },
      });

      await tx.tenantPlanEvent.create({
        data: {
          tenantPlanId: tenantPlan.id,
          tenantId,
          type: "ACTIVATED",
          toPlanVersionId: planVersionId,
          createdBy: createdBy ?? "SYSTEM",
          metadata: {
            bonusExpiresAt: bonusExpiresAt?.toISOString() ?? null,
          },
        },
      });

      return tenantPlan;
    });
  }

  async updateOverrides(
    tenantId: string,
    overrides: UpdatePlanOverridesInput,
    createdBy?: string,
  ): Promise<TenantPlan> {
    return prisma.$transaction(async (tx) => {
      const tenantPlan = await tx.tenantPlan.findUnique({
        where: { tenantId },
      });
      if (!tenantPlan) throw new Error("TenantPlan not found");

      const updated = await tx.tenantPlan.update({
        where: { tenantId },
        data: {
          onboardingFeeOverride: overrides.onboardingFeeOverride,
          perMinuteRateOverride: overrides.perMinuteRateOverride,
        },
      });

      await tx.tenantPlanEvent.create({
        data: {
          tenantPlanId: updated.id,
          tenantId,
          type: "OVERRIDES_UPDATED",
          toPlanVersionId: updated.planVersionId,
          createdBy: createdBy ?? null,
          metadata: {
            onboardingFeeOverride: overrides.onboardingFeeOverride,
            perMinuteRateOverride: overrides.perMinuteRateOverride,
          },
        },
      });

      return updated;
    });
  }

  async updateStatus(
    tenantId: string,
    status: TenantPlanStatus,
    createdBy?: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const tp = await tx.tenantPlan.update({
        where: { tenantId },
        data: { status },
      });

      const eventType =
        status === "CANCELLED"
          ? "CANCELLED"
          : status === "EXPIRED"
            ? "EXPIRED"
            : status === "ACTIVE"
              ? "REACTIVATED"
              : "PLAN_CHANGED";

      await tx.tenantPlanEvent.create({
        data: {
          tenantPlanId: tp.id,
          tenantId,
          type: eventType,
          toPlanVersionId: tp.planVersionId,
          createdBy: createdBy ?? null,
        },
      });
    });
  }

  // ── Enforcement Counts ────────────────────────────────────────

  async countActiveCampaigns(tenantId: string): Promise<number> {
    return prisma.campaign.count({
      where: {
        tenantId,
        status: { in: ["DRAFT", "RUNNING"] },
      },
    });
  }

  async countAgents(tenantId: string): Promise<number> {
    return prisma.assistant.count({
      where: { tenantId },
    });
  }

  async countTeamMembers(tenantId: string): Promise<number> {
    return prisma.tenantUser.count({
      where: { tenantId },
    });
  }
}
