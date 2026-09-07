import prisma from "../../../../shared/config/database/prisma";
import type {
  CampaignRepository,
  CreateCampaignData,
  CampaignStatsResult,
  CampaignPerformanceResult,
  CampaignListItem,
} from "../../application/interfaces/campaign-repository.interface";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import type { CampaignStatus } from "@prisma/client";

export class PrismaCampaignRepository implements CampaignRepository {
  async list(tenantId: string): Promise<CampaignListItem[]> {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      include: {
        assistant: true,
        brochure: {
          select: {
            id: true,
            projectName: true,
            city: true,
            configurations: true,
          },
        },
        batches: {
          select: {
            id: true,
            status: true,
            totalLeads: true,
            completedLeads: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return campaigns as unknown as CampaignListItem[];
  }

  async findById(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignEntityData | null> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) return null;

    return this.toEntityData(campaign);
  }

  async findByIdWithRelations(
    tenantId: string,
    campaignId: string,
  ): Promise<
    | (CampaignEntityData & {
        assistant: { id: string; name: string; bolnaId: string } | null;
        brochure: { id: string; isConfirmed: boolean } | null;
        batches: Array<{ id: string; status: string }>;
      })
    | null
  > {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        assistant: true,
        brochure: true,
        batches: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!campaign) return null;

    return {
      ...this.toEntityData(campaign),
      assistant: campaign.assistant
        ? {
            id: campaign.assistant.id,
            name: campaign.assistant.name,
            bolnaId: campaign.assistant.bolnaId,
          }
        : null,
      brochure: campaign.brochure
        ? {
            id: campaign.brochure.id,
            isConfirmed: campaign.brochure.isConfirmed,
          }
        : null,
      batches: campaign.batches.map((b) => ({
        id: b.id,
        status: b.status,
      })),
    };
  }

  async create(
    tenantId: string,
    data: CreateCampaignData,
  ): Promise<CampaignEntityData> {
    const campaign = await prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        tenantId,
        assistantId: data.assistantId,
        brochureId: data.brochureId,
        variables: data.variables,
        defaultRetryConfig: data.defaultRetryConfig as any,
      },
      include: { assistant: true },
    });

    return this.toEntityData(campaign);
  }

  async updateStatus(
    campaignId: string,
    status: CampaignStatus,
    extra?: { startedAt?: Date; completedAt?: Date },
  ): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status,
        ...(extra?.startedAt && { startedAt: extra.startedAt }),
        ...(extra?.completedAt && { completedAt: extra.completedAt }),
      },
    });
  }

  async incrementTotalLeads(campaignId: string, count: number): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalLeads: { increment: count } },
    });
  }

  async getStats(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignStatsResult> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        assistant: true,
        brochure: {
          select: {
            id: true,
            projectName: true,
            configurations: true,
            startingPrice: true,
          },
        },
        batches: {
          select: {
            id: true,
            status: true,
            fileName: true,
            totalLeads: true,
            calledLeads: true,
            completedLeads: true,
            failedLeads: true,
            createdAt: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const leadStats = await prisma.lead.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: true,
    });

    const callStats = await prisma.call.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: true,
    });

    return {
      campaign: campaign as unknown as CampaignStatsResult["campaign"],
      leads: leadStats.map((s) => ({
        status: s.status,
        _count: s._count,
      })),
      calls: callStats.map((s) => ({
        status: s.status,
        _count: s._count,
      })),
    };
  }

  async getPerformance(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignPerformanceResult> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) throw new Error("Campaign not found");

    const QUALIFYING_DISPOSITIONS = [
      "QUALIFIED_CONSULTANT_FOLLOWUP",
      "SITE_VISIT_INTEREST",
      "INTERESTED_SEND_DETAILS",
      "INTERESTED_GENERAL",
    ];

    const analyses = await prisma.callAnalysis.findMany({
      where: { tenantId, call: { campaignId } },
      select: {
        disposition: true,
        leadTemperature: true,
        preferredNextAction: true,
        doNotCall: true,
      },
    });

    const calls = await prisma.call.findMany({
      where: { campaignId, tenantId, startedAt: { not: null } },
      select: {
        startedAt: true,
        status: true,
        callAnalysis: {
          select: { disposition: true, leadTemperature: true },
        },
      },
    });

    const costAgg = await prisma.call.aggregate({
      where: { campaignId, tenantId, platformCost: { not: null } },
      _sum: { platformCost: true },
    });

    const totalCostInRupees = (costAgg._sum.platformCost ?? 0) / 100;
    // ─────────────────────────────────────────────────────────────

    // Hourly breakdown
    const hourlyStats: Record<
      number,
      { total: number; connected: number; qualified: number }
    > = {};

    for (const call of calls) {
      if (!call.startedAt) continue;
      const hour = new Date(call.startedAt).getHours();

      if (!hourlyStats[hour]) {
        hourlyStats[hour] = { total: 0, connected: 0, qualified: 0 };
      }

      hourlyStats[hour].total += 1;

      if (call.status === "COMPLETED") {
        hourlyStats[hour].connected += 1;
      }

      const disp = call.callAnalysis?.disposition;
      const temp = call.callAnalysis?.leadTemperature;
      if (
        (disp && QUALIFYING_DISPOSITIONS.includes(disp)) ||
        temp === "HOT" ||
        temp === "WARM"
      ) {
        hourlyStats[hour].qualified += 1;
      }
    }

    let bestPickupHour: number | null = null;
    let maxPickupRate = 0;
    let bestConversionHour: number | null = null;
    let maxQualifiedCount = 0;

    for (const [hStr, stat] of Object.entries(hourlyStats)) {
      const hour = parseInt(hStr, 10);
      const pickupRate = stat.total > 0 ? stat.connected / stat.total : 0;

      if (pickupRate > maxPickupRate && stat.total >= 1) {
        maxPickupRate = pickupRate;
        bestPickupHour = hour;
      }

      if (stat.qualified > maxQualifiedCount) {
        maxQualifiedCount = stat.qualified;
        bestConversionHour = hour;
      }
    }

    const formatHourWindow = (hour: number | null): string => {
      if (hour === null) return "Insufficient Data";
      const ampmStart = hour >= 12 ? "PM" : "AM";
      const startHour12 = hour % 12 === 0 ? 12 : hour % 12;
      const nextHour = (hour + 1) % 24;
      const ampmEnd = nextHour >= 12 ? "PM" : "AM";
      const endHour12 = nextHour % 12 === 0 ? 12 : nextHour % 12;
      return `${startHour12}:00 AM - ${endHour12}:00 PM`; // formatted cleanly
    };

    const hotLeads = analyses.filter((a) => a.leadTemperature === "HOT").length;
    const callbacks = analyses.filter(
      (a) =>
        a.preferredNextAction === "CONSULTANT_CALL" ||
        a.preferredNextAction === "FOLLOWUP_CALL",
    ).length;
    const siteVisits = analyses.filter(
      (a) =>
        a.disposition === "SITE_VISIT_INTEREST" ||
        a.preferredNextAction === "SITE_VISIT",
    ).length;
    const dnc = analyses.filter((a) => a.doNotCall === "YES").length;

    const withDisposition = analyses.filter((a) => a.disposition !== null);
    const qualified = withDisposition.filter(
      (a) => a.disposition && QUALIFYING_DISPOSITIONS.includes(a.disposition),
    ).length;

    const qualificationRate =
      withDisposition.length > 0
        ? ((qualified / withDisposition.length) * 100).toFixed(1)
        : "0.0";

    const costPerLead =
      campaign.completedLeads > 0
        ? parseFloat((totalCostInRupees / campaign.completedLeads).toFixed(2))
        : 0;

    return {
      hotLeads,
      callbacks,
      siteVisits,
      dnc,
      totalCost: totalCostInRupees, // Exposing our actual cost in INR Rupees to the tenant
      costPerLead,
      qualificationRate,
      bestPickupTime: formatHourWindow(bestPickupHour),
      bestConversionTime: formatHourWindow(bestConversionHour),
      topBudget: "N/A",
      topConfiguration: "N/A",
    };
  }

  async checkAssistantExists(
    tenantId: string,
    assistantId: string,
  ): Promise<boolean> {
    const count = await prisma.assistant.count({
      where: { id: assistantId, tenantId },
    });
    return count > 0;
  }

  async checkBrochureConfirmed(
    tenantId: string,
    brochureId: string,
  ): Promise<boolean> {
    const brochure = await prisma.brochure.findFirst({
      where: { id: brochureId, tenantId },
      select: { isConfirmed: true },
    });
    return brochure?.isConfirmed ?? false;
  }

  // ── Private Mapper ───────────────────────────────────────────────────────

  private toEntityData(campaign: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    tenantId: string;
    assistantId: string;
    brochureId: string | null;
    variables: unknown;
    defaultRetryConfig: unknown;
    totalLeads: number;
    calledLeads: number;
    completedLeads: number;
    failedLeads: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CampaignEntityData {
    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status as CampaignStatus,
      tenantId: campaign.tenantId,
      assistantId: campaign.assistantId,
      brochureId: campaign.brochureId,
      variables: campaign.variables as Record<string, string> | null,
      defaultRetryConfig: campaign.defaultRetryConfig as Record<
        string,
        unknown
      > | null,
      totalLeads: campaign.totalLeads,
      calledLeads: campaign.calledLeads,
      completedLeads: campaign.completedLeads,
      failedLeads: campaign.failedLeads,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
