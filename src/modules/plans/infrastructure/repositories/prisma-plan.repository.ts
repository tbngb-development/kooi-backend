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
  ListPlanSubscribersQuery,
  ListPlanSubscribersResponse,
  PlanSubscriberItem,
  TenantUsageSnapshot,
} from "../../application/dto/plan.dto";
import { resolveEffectiveTerms } from "../../domain/entities/plan.entity";
import {
  PlanNotFoundError,
  PlanVersionNotFoundError,
  TenantPlanNotFoundError,
  PlanVersionImmutableError,
  PlanVersionNotPublishedError,
  CannotArchiveLastPublishedVersionError,
} from "../../domain/errors/plan.errors";

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
    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new PlanNotFoundError(id);

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
      const plan = await tx.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new PlanNotFoundError(planId);

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
      if (!v) throw new PlanVersionNotFoundError(versionId);
      if (v.status === "ARCHIVED") {
        throw new PlanVersionImmutableError(v.status);
      }
      if (v.status === "PUBLISHED") {
        return v; // Idempotent publish
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
    return prisma.$transaction(async (tx) => {
      const version = await tx.planVersion.findUnique({
        where: { id: versionId },
        include: { plan: true },
      });
      if (!version) throw new PlanVersionNotFoundError(versionId);

      if (version.status === "ARCHIVED") {
        return version; // Idempotent
      }

      // Safeguard: Do not allow archiving the only published version of an active plan
      if (version.plan.isActive && version.status === "PUBLISHED") {
        const otherPublished = await tx.planVersion.count({
          where: {
            planId: version.planId,
            status: "PUBLISHED",
            id: { not: versionId },
          },
        });

        if (otherPublished === 0) {
          throw new CannotArchiveLastPublishedVersionError(version.plan.name);
        }
      }

      return tx.planVersion.update({
        where: { id: versionId },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
        },
      });
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
      const planVersion = await tx.planVersion.findUnique({
        where: { id: planVersionId },
      });
      if (!planVersion || planVersion.planId !== planId) {
        throw new PlanVersionNotFoundError(planVersionId);
      }
      if (planVersion.status !== "PUBLISHED") {
        throw new PlanVersionNotPublishedError(
          planVersionId,
          planVersion.status,
        );
      }

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
      if (!planVersion) throw new PlanVersionNotFoundError(planVersionId);

      if (planVersion.status !== "PUBLISHED") {
        throw new PlanVersionNotPublishedError(
          planVersionId,
          planVersion.status,
        );
      }

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
      if (!tenantPlan) throw new TenantPlanNotFoundError(tenantId);

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
      const existing = await tx.tenantPlan.findUnique({ where: { tenantId } });
      if (!existing) throw new TenantPlanNotFoundError(tenantId);

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

  async recordBonusExpiredEvent(tenantId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const tenantPlan = await tx.tenantPlan.findUnique({
        where: { tenantId },
      });

      if (!tenantPlan || tenantPlan.status !== "ACTIVE") return;

      await tx.tenantPlanEvent.create({
        data: {
          tenantPlanId: tenantPlan.id,
          tenantId,
          type: "BONUS_EXPIRED",
          toPlanVersionId: tenantPlan.planVersionId,
          createdBy: "SYSTEM",
          metadata: {
            reason: "Scheduled bonus expiry",
            expiredAt: new Date().toISOString(),
          },
        },
      });
    });
  }

  async listSubscribers(
    query: ListPlanSubscribersQuery,
  ): Promise<ListPlanSubscribersResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? "activatedAt";
    const sortOrder = query.sortOrder ?? "desc";

    // ── Build WHERE clause ──────────────────────────────────────
    const where: Record<string, unknown> = {
      planId: query.planId,
    };

    if (query.versionId) {
      where.planVersionId = query.versionId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.tenant = {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
        ],
      };
    }

    // ── Build ORDER BY clause ───────────────────────────────────
    let orderBy: Record<string, string>;

    switch (sortBy) {
      case "tenantName":
        orderBy = { tenant: { name: sortOrder } } as unknown as Record<
          string,
          string
        >;
        break;
      case "planVersion":
        orderBy = { planVersion: { version: sortOrder } } as unknown as Record<
          string,
          string
        >;
        break;
      case "status":
        orderBy = { status: sortOrder };
        break;
      case "createdAt":
        orderBy = { createdAt: sortOrder };
        break;
      case "activatedAt":
      default:
        orderBy = { activatedAt: sortOrder };
        break;
    }

    // ── Execute queries ─────────────────────────────────────────
    const [total, tenantPlans] = await Promise.all([
      prisma.tenantPlan.count({ where }),
      prisma.tenantPlan.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          tenant: {
            select: { id: true, name: true, email: true },
          },
          plan: {
            select: { id: true, name: true, slug: true, displayOrder: true },
          },
          planVersion: true,
        },
      }),
    ]);

    // ── Enrich with usage snapshots ─────────────────────────────
    const data: PlanSubscriberItem[] = await Promise.all(
      tenantPlans.map(async (tp) => {
        const effectiveTerms = resolveEffectiveTerms(tp.plan, tp.planVersion, {
          onboardingFeeOverride: tp.onboardingFeeOverride,
          perMinuteRateOverride: tp.perMinuteRateOverride,
        });

        // Fetch usage counts in parallel
        const [activeCampaigns, agents, teamMembers] = await Promise.all([
          this.countActiveCampaigns(tp.tenantId),
          this.countAgents(tp.tenantId),
          this.countTeamMembers(tp.tenantId),
        ]);

        const usage: TenantUsageSnapshot = {
          activeCampaigns,
          maxActiveCampaigns: effectiveTerms.maxActiveCampaigns,
          agents,
          maxAgents: effectiveTerms.maxAgents,
          teamMembers,
          maxTeamMembers: effectiveTerms.maxTeamMembers,
        };

        return {
          tenantId: tp.tenant.id,
          tenantName: tp.tenant.name,
          tenantEmail: tp.tenant.email,
          tenantPlanId: tp.id,
          status: tp.status,

          planId: tp.plan.id,
          planName: tp.plan.name,
          planVersionId: tp.planVersion.id,
          planVersion: tp.planVersion.version,
          planVersionStatus: tp.planVersion.status,

          effectiveTerms,
          overrides: {
            onboardingFeeOverride: tp.onboardingFeeOverride,
            perMinuteRateOverride: tp.perMinuteRateOverride,
          },

          activatedAt: tp.activatedAt?.toISOString() ?? null,
          bonusExpiresAt: tp.bonusExpiresAt?.toISOString() ?? null,
          createdAt: tp.createdAt.toISOString(),

          usage,
        };
      }),
    );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Enforcement Counts ────────────────────────────────────────

  async countActiveCampaigns(tenantId: string): Promise<number> {
    return prisma.campaign.count({
      where: {
        tenantId,
        status: { in: ["DRAFT", "RUNNING"] },
        isDeleted: false,
      },
    });
  }

  async countRunningCampaigns(tenantId: string): Promise<number> {
    return prisma.campaign.count({
      where: {
        tenantId,
        status: "RUNNING",
        isDeleted: false,
      },
    });
  }

  async countConcurrentCampaignsAtTime(
    tenantId: string,
    targetTime: Date,
    excludeCampaignId?: string,
    windowMinutes = 60,
  ): Promise<number> {
    const windowStart = new Date(
      targetTime.getTime() - windowMinutes * 60 * 1000,
    );
    const windowEnd = new Date(
      targetTime.getTime() + windowMinutes * 60 * 1000,
    );

    const conflictingBatches = await prisma.leadBatch.findMany({
      where: {
        tenantId,
        campaignId: excludeCampaignId ? { not: excludeCampaignId } : undefined,
        isDeleted: false,
        status: { in: ["SCHEDULED", "RUNNING"] },
        OR: [
          { status: "RUNNING" },
          {
            status: "SCHEDULED",
            scheduledAt: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
        ],
      },
      select: { campaignId: true },
      distinct: ["campaignId"],
    });

    return conflictingBatches.length;
  }

  async countAgents(tenantId: string): Promise<number> {
    return prisma.assistant.count({
      where: { tenantId, isDeleted: false },
    });
  }

  async countTeamMembers(tenantId: string): Promise<number> {
    return prisma.tenantUser.count({
      where: { tenantId },
    });
  }
}
