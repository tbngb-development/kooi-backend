import prisma from "../../../../shared/config/database/prisma";
import { type RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  CampaignRepository,
  CreateCampaignData,
  CampaignStatsResult,
  CampaignListItem,
  AssistantWithAgentData,
} from "../../application/interfaces/campaign-repository.interface";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import { type CampaignStatus } from "@prisma/client";
import type {
  ExtractionInsightDisposition,
  ExtractionInsightResult,
  ExtractionOverviewDisposition,
  ExtractionOverviewResult,
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

  async getExtractionInsights(
    tenantId: string,
    campaignId: string,
    batchId?: string,
    topN: number = 10,
  ): Promise<ExtractionInsightResult> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    // Single GROUP BY — one row per (disposition, normalizedValue)
    const rows = await prisma.callExtractionInsight.groupBy({
      by: [
        "dispositionId",
        "dispositionSlug",
        "dispositionName",
        "categoryName",
        "normalizedValue",
        "subjectiveValue",
      ],
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
      },
      _count: true,
      orderBy: { _count: { normalizedValue: "desc" } },
    });

    if (rows.length === 0) {
      return { campaignId, totalCalls: 0, insights: [] };
    }

    // Total unique calls with any insight data
    const totalCallsResult = await prisma.callExtractionInsight.findMany({
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
      },
      select: { callId: true },
      distinct: ["callId"],
    });
    const totalCalls = totalCallsResult.length;

    // Group by disposition
    const dispositionMap = new Map<
      string,
      ExtractionInsightDisposition & {
        allValues: Array<{
          value: string;
          displayValue: string;
          count: number;
        }>;
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
          uniqueValues: 0,
          totalCount: 0,
          topValues: [],
          allValues: [],
        };
        dispositionMap.set(row.dispositionId, acc);
      }

      const count = row._count;
      acc.totalCount += count;
      acc.allValues.push({
        value: row.normalizedValue,
        displayValue: row.subjectiveValue,
        count,
      });
    }

    // Sort, slice top N, calculate percentages
    const insights: ExtractionInsightDisposition[] = [];
    for (const acc of dispositionMap.values()) {
      acc.allValues.sort((a, b) => b.count - a.count);
      const top = acc.allValues.slice(0, topN);

      acc.topValues = top.map((v) => ({
        value: v.value,
        displayValue: v.displayValue,
        count: v.count,
        percentage:
          acc.totalCount > 0
            ? parseFloat(((v.count / acc.totalCount) * 100).toFixed(1))
            : 0,
      }));

      acc.uniqueValues = acc.allValues.length;
      delete (acc as any).allValues;
      insights.push(acc);
    }

    return { campaignId, totalCalls, insights };
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
