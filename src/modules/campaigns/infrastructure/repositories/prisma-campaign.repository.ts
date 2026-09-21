import prisma from "../../../../shared/config/database/prisma";
import { type RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  CampaignRepository,
  CreateCampaignData,
  CampaignStatsResult,
  CampaignPerformanceResult,
  CampaignListItem,
  AssistantWithAgentData,
} from "../../application/interfaces/campaign-repository.interface";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import { type CampaignStatus } from "@prisma/client";
import type {
  CampaignPerformanceV2Result,
  ExtractionOverviewDisposition,
  ExtractionOverviewResult,
  PerformanceV2MetricBreakdown,
} from "../../application/dto/campaign.dto";

export class PrismaCampaignRepository implements CampaignRepository {
  async list(tenantId: string): Promise<CampaignListItem[]> {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      include: {
        assistant: true,
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
        assistant: {
          id: string;
          name: string;
          platformAgent: { bolnaId: string };
        } | null;
        batches: Array<{ id: string; status: string }>;
      })
    | null
  > {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        assistant: {
          include: {
            platformAgent: true,
          },
        },
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
            platformAgent: {
              bolnaId: campaign.assistant.platformAgent.bolnaId,
            },
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
        assistant: {
          include: {
            platformAgent: true,
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
      campaign: {
        ...this.toEntityData(campaign),
        assistant: campaign.assistant
          ? {
              id: campaign.assistant.id,
              name: campaign.assistant.name,
              platformAgent: {
                bolnaId: campaign.assistant.platformAgent.bolnaId,
              },
            }
          : null,
        batches: campaign.batches,
      },
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
    batchId?: string,
  ): Promise<CampaignPerformanceResult> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) throw new Error("Campaign not found");

    let completedLeads = campaign.completedLeads;
    if (batchId) {
      const batch = await prisma.leadBatch.findFirst({
        where: { id: batchId, campaignId, tenantId },
      });
      if (!batch) throw new Error("Batch not found");
      completedLeads = batch.completedLeads;
    }

    const QUALIFYING_DISPOSITIONS = [
      "QUALIFIED_CONSULTANT_FOLLOWUP",
      "SITE_VISIT_INTEREST",
      "INTERESTED_SEND_DETAILS",
      "INTERESTED_GENERAL",
    ];

    const analyses = await prisma.callAnalysis.findMany({
      where: {
        tenantId,
        call: {
          campaignId,
          ...(batchId && { batchId }),
        },
      },
      select: {
        disposition: true,
        leadTemperature: true,
        preferredNextAction: true,
        doNotCall: true,
      },
    });

    const calls = await prisma.call.findMany({
      where: {
        campaignId,
        tenantId,
        ...(batchId && { batchId }),
        startedAt: { not: null },
      },
      select: {
        startedAt: true,
        status: true,
        callAnalysis: {
          select: { disposition: true, leadTemperature: true },
        },
      },
    });

    const costAgg = await prisma.call.aggregate({
      where: {
        campaignId,
        tenantId,
        ...(batchId && { batchId }),
        platformCost: { not: null },
      },
      _sum: { platformCost: true },
    });

    const totalCostInRupees = (costAgg._sum.platformCost ?? 0) / 100;

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
      return `${startHour12}:00 ${ampmStart} - ${endHour12}:00 ${ampmEnd}`;
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
      completedLeads > 0
        ? parseFloat((totalCostInRupees / completedLeads).toFixed(2))
        : 0;

    return {
      hotLeads,
      callbacks,
      siteVisits,
      dnc,
      totalCost: totalCostInRupees,
      costPerLead,
      qualificationRate,
      bestPickupTime: formatHourWindow(bestPickupHour),
      bestConversionTime: formatHourWindow(bestConversionHour),
      topBudget: "N/A",
      topConfiguration: "N/A",
    };
  }

  async getPerformanceV2(
    tenantId: string,
    campaignId: string,
    batchId?: string,
  ): Promise<CampaignPerformanceV2Result> {
    const rows = await prisma.callMetric.groupBy({
      by: ["metricKey", "metricLabel", "actualValue", "matched", "matchValue"],
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
      },
      _count: true,
    });

    if (rows.length === 0) {
      return { metrics: [] };
    }

    const metricMap = new Map<
      string,
      {
        label: string;
        totalEvaluated: number;
        matched: number;
        actualValue: string;
        matchValue: string;
        valueCounts: Record<string, number>;
      }
    >();

    for (const row of rows) {
      let acc = metricMap.get(row.metricKey);
      if (!acc) {
        acc = {
          label: row.metricLabel,
          actualValue: row.actualValue,
          matchValue: row.matchValue,
          totalEvaluated: 0,
          matched: 0,
          valueCounts: {},
        };
        metricMap.set(row.metricKey, acc);
      }

      const count = row._count;
      acc.totalEvaluated += count;
      if (row.matched) acc.matched += count;
      acc.valueCounts[row.actualValue] = count;
    }

    const metrics: PerformanceV2MetricBreakdown[] = [];
    for (const [key, acc] of metricMap) {
      const matchRate =
        acc.totalEvaluated > 0
          ? parseFloat(((acc.matched / acc.totalEvaluated) * 100).toFixed(1))
          : 0;

      metrics.push({
        key,
        label: acc.label,
        totalEvaluated: acc.totalEvaluated,
        matched: acc.matched,
        actualValue: acc.actualValue,
        matchValue: acc.matchValue,
        matchRate,
        actualValueBreakdown: acc.valueCounts,
      });
    }

    return { metrics };
  }

  async getExtractionOverview(
    tenantId: string,
    campaignId: string,
    batchId?: string,
  ): Promise<ExtractionOverviewResult> {
    // Verify campaign belongs to tenant
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Single GROUP BY query — returns one row per (disposition, value)
    const rows = await prisma.callExtractionOverview.groupBy({
      by: [
        "dispositionId",
        "dispositionSlug",
        "dispositionName",
        "categoryName",
        "objectiveValue",
      ],
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
      },
      _count: true,
      orderBy: [
        { dispositionSlug: "asc" },
        { _count: { objectiveValue: "desc" } },
      ],
    });

    if (rows.length === 0) {
      return { campaignId, totalCalls: 0, dispositions: [] };
    }

    // Get total unique calls for percentage calculation
    const totalCallsResult = await prisma.callExtractionOverview.findMany({
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
      },
      select: { callId: true },
      distinct: ["callId"],
    });
    const totalCalls = totalCallsResult.length;

    // Group rows by disposition
    const dispositionMap = new Map<
      string,
      {
        dispositionId: string;
        dispositionSlug: string;
        dispositionName: string;
        categoryName: string;
        values: Array<{ value: string; count: number; percentage: number }>;
        totalCount: number;
      }
    >();

    for (const row of rows) {
      let acc = dispositionMap.get(row.dispositionId);
      if (!acc) {
        acc = {
          dispositionId: row.dispositionId,
          dispositionSlug: row.dispositionSlug,
          dispositionName: row.dispositionName,
          categoryName: row.categoryName,
          values: [],
          totalCount: 0,
        };
        dispositionMap.set(row.dispositionId, acc);
      }

      const count = row._count;
      acc.totalCount += count;
      acc.values.push({
        value: row.objectiveValue,
        count,
        percentage: 0, // calculated below
      });
    }

    // Calculate percentages
    const dispositions: ExtractionOverviewDisposition[] = [];
    for (const acc of dispositionMap.values()) {
      for (const v of acc.values) {
        v.percentage =
          acc.totalCount > 0
            ? parseFloat(((v.count / acc.totalCount) * 100).toFixed(1))
            : 0;
      }
      dispositions.push(acc);
    }

    return { campaignId, totalCalls, dispositions };
  }

  async findAssistantWithAgent(
    tenantId: string,
    assistantId: string,
  ): Promise<AssistantWithAgentData | null> {
    const assistant = await prisma.assistant.findFirst({
      where: { id: assistantId, tenantId },
      select: {
        id: true,
        name: true,
        platformAgent: {
          select: {
            id: true,
            bolnaId: true,
            requiredVariables: true,
          },
        },
      },
    });

    if (!assistant) return null;

    return {
      id: assistant.id,
      name: assistant.name,
      platformAgent: {
        id: assistant.platformAgent.id,
        bolnaId: assistant.platformAgent.bolnaId,
        requiredVariables: assistant.platformAgent.requiredVariables as
          RequiredVariable[] | null,
      },
    };
  }

  // ── REMOVED checkBrochureConfirmed ──

  private toEntityData(campaign: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    tenantId: string;
    assistantId: string;
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
