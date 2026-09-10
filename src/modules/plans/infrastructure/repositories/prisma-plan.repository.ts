import type { Plan, PlanStatus, TenantPlan } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type {
  PlanRepository,
  TenantActivePlan,
} from "../../application/interfaces/plan-repository.interface";
import type {
  CreatePlanInput,
  UpdatePlanInput,
} from "../../application/dto/plan.dto";

export class PrismaPlanRepository implements PlanRepository {
  // ── Plans (Admin) ─────────────────────────────────────────────

  async create(input: CreatePlanInput): Promise<Plan> {
    return prisma.plan.create({
      data: {
        name: input.name,
        slug: input.slug,
        displayOrder: input.displayOrder ?? 0,

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

        ...(input.pricingModel !== undefined && {
          pricingModel: input.pricingModel,
        }),
        ...(input.onboardingFee !== undefined && {
          onboardingFee: input.onboardingFee,
        }),
        ...(input.onboardingFeeOriginal !== undefined && {
          onboardingFeeOriginal: input.onboardingFeeOriginal,
        }),
        ...(input.perMinuteRate !== undefined && {
          perMinuteRate: input.perMinuteRate,
        }),
        ...(input.billingMinimumSec !== undefined && {
          billingMinimumSec: input.billingMinimumSec,
        }),
        ...(input.billingIncrementSec !== undefined && {
          billingIncrementSec: input.billingIncrementSec,
        }),

        ...(input.maxActiveCampaigns !== undefined && {
          maxActiveCampaigns: input.maxActiveCampaigns,
        }),
        ...(input.maxLeadsPerBatch !== undefined && {
          maxLeadsPerBatch: input.maxLeadsPerBatch,
        }),
        ...(input.maxAgents !== undefined && {
          maxAgents: input.maxAgents,
        }),
        ...(input.maxTeamMembers !== undefined && {
          maxTeamMembers: input.maxTeamMembers,
        }),
        ...(input.retryAutomation !== undefined && {
          retryAutomation: input.retryAutomation,
        }),
        ...(input.industryPackLimit !== undefined && {
          industryPackLimit: input.industryPackLimit,
        }),

        ...(input.callingChannel !== undefined && {
          callingChannel: input.callingChannel,
        }),
        ...(input.brochureUpload !== undefined && {
          brochureUpload: input.brochureUpload,
        }),

        ...(input.dashboardTier !== undefined && {
          dashboardTier: input.dashboardTier,
        }),
        ...(input.agentCapability !== undefined && {
          agentCapability: input.agentCapability,
        }),
        ...(input.integrations !== undefined && {
          integrations: input.integrations,
        }),
        ...(input.supportTier !== undefined && {
          supportTier: input.supportTier,
        }),

        ...(input.lowBalanceThreshold !== undefined && {
          lowBalanceThreshold: input.lowBalanceThreshold,
        }),
        ...(input.includedBalance !== undefined && {
          includedBalance: input.includedBalance,
        }),
        ...(input.bonusValidityDays !== undefined && {
          bonusValidityDays: input.bonusValidityDays,
        }),
      },
    });
  }

  async findById(id: string): Promise<Plan | null> {
    return prisma.plan.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Plan | null> {
    return prisma.plan.findUnique({ where: { slug } });
  }

  async listActive(): Promise<Plan[]> {
    return prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });
  }

  async listAll(): Promise<Plan[]> {
    return prisma.plan.findMany({
      orderBy: { displayOrder: "asc" },
    });
  }

  // ── Tenant Plans ──────────────────────────────────────────────

  async getActivePlanForTenant(
    tenantId: string,
  ): Promise<TenantActivePlan | null> {
    const tenantPlan = await prisma.tenantPlan.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!tenantPlan) return null;

    return {
      ...tenantPlan.plan,
      status: tenantPlan.status,
      activatedAt: tenantPlan.activatedAt,
      bonusExpiresAt: tenantPlan.bonusExpiresAt,
    };
  }

  async selectPlan(tenantId: string, planId: string): Promise<TenantPlan> {
    return prisma.tenantPlan.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId,
        status: "PENDING_PAYMENT",
      },
      update: {
        planId,
        status: "PENDING_PAYMENT",
        activatedAt: null,
        bonusExpiresAt: null,
      },
    });
  }

  async activatePlan(
    tenantId: string,
    planId: string,
    bonusExpiresAt: Date | null,
  ): Promise<TenantPlan> {
    return prisma.tenantPlan.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId,
        status: "ACTIVE",
        activatedAt: new Date(),
        bonusExpiresAt,
      },
      update: {
        planId,
        status: "ACTIVE",
        activatedAt: new Date(),
        bonusExpiresAt,
      },
    });
  }

  async updateStatus(tenantId: string, status: PlanStatus): Promise<void> {
    await prisma.tenantPlan.update({
      where: { tenantId },
      data: { status },
    });
  }

  // ── Enforcement Queries ───────────────────────────────────────

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
