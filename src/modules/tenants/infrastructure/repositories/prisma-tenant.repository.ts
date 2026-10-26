import prisma from "../../../../shared/config/database/prisma";
import type {
  TenantRepository,
  TenantWithCounts,
  TenantStatsResult,
} from "../../application/interfaces/tenant-repository.interface";
import type { TenantEntityData } from "../../domain/tenant.entity";

export class PrismaTenantRepository implements TenantRepository {
  async list(): Promise<TenantWithCounts[]> {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: true,
            campaigns: true,
            leads: true,
            calls: true,
          },
        },
      },
    });

    return tenants as unknown as TenantWithCounts[];
  }

  async findById(id: string): Promise<TenantWithCounts | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
            campaigns: true,
            leads: true,
            calls: true,
          },
        },
        tenantPlan: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
              },
            },
            planVersion: {
              select: {
                id: true,
                version: true,
                status: true,
                currency: true,
                pricingModel: true,
                onboardingFee: true,
                perMinuteRate: true,
                billingMinimumSec: true,
                billingIncrementSec: true,
                maxActiveCampaigns: true,
                maxAgents: true,
                includedBalance: true,
                bonusValidityDays: true,
              },
            },
          },
        },
        wallet: {
          select: {
            id: true,
            cashBalance: true,
            bonusBalance: true,
            bonusExpiresAt: true,
            currency: true,
            isActive: true,
          },
        },
        bolnaApiKey: {
          select: {
            id: true,
            keyIdentifier: true,
            type: true,
            isActive: true,
            bolnaProfileName: true,
            bolnaProfileEmail: true,
            bolnaWalletBalance: true,
            bolnaConcurrencyMax: true,
            bolnaConcurrencyCurrent: true,
            bolnaProfileFetchedAt: true,
          },
        },
      },
    });

    return tenant as unknown as TenantWithCounts;
  }

  async update(
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      suspensionReason?: string | null;
      suspendedAt?: Date | null;
      suspendedBy?: string | null;
    },
  ): Promise<TenantEntityData> {
    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(typeof data.isActive === "boolean" && { isActive: data.isActive }),
        ...(data.suspensionReason !== undefined && {
          suspensionReason: data.suspensionReason,
        }),
        ...(data.suspendedAt !== undefined && {
          suspendedAt: data.suspendedAt,
        }),
        ...(data.suspendedBy !== undefined && {
          suspendedBy: data.suspendedBy,
        }),
      },
    });

    return updated as unknown as TenantEntityData;
  }

  async getStats(id: string): Promise<TenantStatsResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        wallet: {
          select: {
            cashBalance: true,
            bonusBalance: true,
            bonusExpiresAt: true,
            currency: true,
          },
        },
      },
    });
    if (!tenant) throw new Error("Tenant not found");

    const [
      totalUsers,
      totalCalls,
      completedCalls,
      callingCalls,
      pendingCalls,
      failedCalls,
      busyCalls,
      noAnswerCalls,
      callAggregates,
      totalRecharges,
      successfulRecharges,
      failedRecharges,
      rechargeSum,
      totalCampaigns,
      runningCampaigns,
      draftCampaigns,
      completedCampaigns,
      failedCampaigns,
      totalBatches,
      processingBatches,
      completedBatches,
      failedBatches,
      totalLeads,
      pendingLeads,
      calledLeads,
      noAnswerLeads,
      failedLeads,
      dncLeads,
      totalAssistants,
    ] = await prisma.$transaction([
      prisma.tenantUser.count({ where: { tenantId: id } }),

      // Calls breakdown
      prisma.call.count({ where: { tenantId: id, isDeleted: false } }),
      prisma.call.count({
        where: { tenantId: id, status: "COMPLETED", isDeleted: false },
      }),
      prisma.call.count({
        where: { tenantId: id, status: "CALLING", isDeleted: false },
      }),
      prisma.call.count({
        where: { tenantId: id, status: "PENDING", isDeleted: false },
      }),
      prisma.call.count({
        where: { tenantId: id, status: "FAILED", isDeleted: false },
      }),
      prisma.call.count({
        where: { tenantId: id, status: "BUSY", isDeleted: false },
      }),
      prisma.call.count({
        where: { tenantId: id, status: "NO_ANSWER", isDeleted: false },
      }),
      prisma.call.aggregate({
        where: { tenantId: id, isDeleted: false },
        _sum: {
          duration: true,
          billableSeconds: true,
          chargedAmount: true,
          platformCost: true,
        },
      }),

      // Recharges breakdown
      prisma.recharge.count({ where: { tenantId: id } }),
      prisma.recharge.count({ where: { tenantId: id, status: "SUCCESS" } }),
      prisma.recharge.count({ where: { tenantId: id, status: "FAILED" } }),
      prisma.recharge.aggregate({
        where: { tenantId: id, status: "SUCCESS" },
        _sum: { amount: true },
      }),

      // Campaigns breakdown
      prisma.campaign.count({ where: { tenantId: id, isDeleted: false } }),
      prisma.campaign.count({
        where: { tenantId: id, status: "RUNNING", isDeleted: false },
      }),
      prisma.campaign.count({
        where: { tenantId: id, status: "DRAFT", isDeleted: false },
      }),
      prisma.campaign.count({
        where: { tenantId: id, status: "COMPLETED", isDeleted: false },
      }),
      prisma.campaign.count({
        where: { tenantId: id, status: "FAILED", isDeleted: false },
      }),

      // Batches breakdown
      prisma.leadBatch.count({ where: { tenantId: id, isDeleted: false } }),
      prisma.leadBatch.count({
        where: { tenantId: id, status: "PROCESSING", isDeleted: false },
      }),
      prisma.leadBatch.count({
        where: { tenantId: id, status: "COMPLETED", isDeleted: false },
      }),
      prisma.leadBatch.count({
        where: { tenantId: id, status: "FAILED", isDeleted: false },
      }),

      // Leads breakdown
      prisma.lead.count({ where: { tenantId: id, isDeleted: false } }),
      prisma.lead.count({
        where: { tenantId: id, status: "PENDING", isDeleted: false },
      }),
      prisma.lead.count({
        where: { tenantId: id, status: "CALLED", isDeleted: false },
      }),
      prisma.lead.count({
        where: { tenantId: id, status: "NO_ANSWER", isDeleted: false },
      }),
      prisma.lead.count({
        where: { tenantId: id, status: "FAILED", isDeleted: false },
      }),
      prisma.lead.count({
        where: { tenantId: id, doNotCall: true, isDeleted: false },
      }),

      // Assistants
      prisma.assistant.count({ where: { tenantId: id, isDeleted: false } }),
    ]);

    const cashBalance = tenant.wallet?.cashBalance ?? 0;
    const bonusBalance = tenant.wallet?.bonusBalance ?? 0;

    return {
      tenant: tenant as unknown as TenantEntityData,
      stats: {
        totalUsers,
        totalLeads,
        totalCalls,
        completedCalls,
        activeCampaigns: runningCampaigns,
        users: {
          total: totalUsers,
        },
        financials: {
          walletCashBalance: cashBalance,
          walletBonusBalance: bonusBalance,
          walletTotalBalance: cashBalance + bonusBalance,
          totalRechargesCount: totalRecharges,
          successfulRechargesCount: successfulRecharges,
          failedRechargesCount: failedRecharges,
          totalRechargedAmountPaisa: rechargeSum._sum.amount ?? 0,
          customerChargedPaisa: callAggregates._sum.chargedAmount ?? 0,
          platformCostPaisa: callAggregates._sum.platformCost ?? 0,
        },
        calls: {
          total: totalCalls,
          completed: completedCalls,
          calling: callingCalls,
          pending: pendingCalls,
          failed: failedCalls,
          busy: busyCalls,
          noAnswer: noAnswerCalls,
          totalDurationSeconds: callAggregates._sum.duration ?? 0,
          totalBillableSeconds: callAggregates._sum.billableSeconds ?? 0,
        },
        campaigns: {
          total: totalCampaigns,
          running: runningCampaigns,
          draft: draftCampaigns,
          completed: completedCampaigns,
          failed: failedCampaigns,
        },
        batches: {
          total: totalBatches,
          processing: processingBatches,
          completed: completedBatches,
          failed: failedBatches,
        },
        leads: {
          total: totalLeads,
          pending: pendingLeads,
          called: calledLeads,
          noAnswer: noAnswerLeads,
          failed: failedLeads,
          dncCount: dncLeads,
        },
        assistants: {
          total: totalAssistants,
        },
      },
    };
  }
}
