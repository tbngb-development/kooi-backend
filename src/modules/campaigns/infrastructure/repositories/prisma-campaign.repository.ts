// modules/campaigns/infrastructure/repositories/prisma-campaign.repository.ts

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
import type { Prisma, CampaignStatus } from "@prisma/client";
import type {
  CampaignDetailOverview,
  CampaignListOverview,
  ExtractionInsightDisposition,
  ExtractionInsightResult,
  ExtractionOverviewDisposition,
  ExtractionOverviewResult,
  ListCampaignsFilters,
  PaginatedCampaignsResult,
} from "../../application/dto/campaign.dto";

export class PrismaCampaignRepository implements CampaignRepository {
  async list(
    tenantId: string,
    filters: ListCampaignsFilters,
  ): Promise<PaginatedCampaignsResult> {
    const {
      search,
      status,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
      isDeleted = false,
    } = filters;

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(Math.max(1, limit), 100);
    const skip = (pageNum - 1) * limitNum;

    // ── Build WHERE clause ──
    const where: Prisma.CampaignWhereInput = { tenantId };

    // Apply exclusion filters for soft deleted data unless explicitly requested
    where.isDeleted = isDeleted;

    if (search && search.trim() !== "") {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { assistant: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    if (status && status.trim() !== "") {
      const statuses = status
        .split(",")
        .map((s) => s.trim() as CampaignStatus)
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    // ── Sorting ──
    const validSortFields = ["createdAt", "totalLeads"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";

    // ── Parallel Query Operations ──
    const [campaigns, total, overview] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: {
          assistant: { select: { id: true, name: true } },
          batches: {
            where: { isDeleted },
            select: {
              id: true,
              status: true,
              totalLeads: true,
              completedLeads: true,
            },
          },
        },
        orderBy: { [orderField]: orderDir },
        skip,
        take: limitNum,
      }),
      prisma.campaign.count({ where }),
      this.getTenantCampaignOverview(tenantId),
    ]);

    return {
      overview,
      items: campaigns as unknown as CampaignListItem[],
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  // Helper isolation for tenant aggregated overview metrics
  private async getTenantCampaignOverview(
    tenantId: string,
    isDeleted?: boolean,
  ): Promise<CampaignListOverview> {
    const baseWhere = {
      tenantId,
    };

    const [totalCampaigns, totalLeads, totalCalls, runningCampaigns] =
      await Promise.all([
        prisma.campaign.count({ where: baseWhere }),
        prisma.lead.count({ where: { tenantId } }), // Tenant-scoped counts remain consistent
        prisma.call.count({ where: { tenantId } }),
        prisma.campaign.count({ where: { ...baseWhere, status: "RUNNING" } }),
      ]);

    return { totalCampaigns, totalLeads, totalCalls, runningCampaigns };
  }

  async getCampaignOverviewStats(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignDetailOverview> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, totalLeads: true },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const callWhere = { campaignId };

    const [
      totalCalls,
      completedCalls,
      failedCalls,
      noAnswerCalls,
      busyCalls,
      stoppedCalls,
      costAgg,
      durationAgg,
    ] = await Promise.all([
      prisma.call.count({ where: callWhere }),
      prisma.call.count({ where: { ...callWhere, status: "COMPLETED" } }),
      prisma.call.count({ where: { ...callWhere, status: "FAILED" } }),
      prisma.call.count({ where: { ...callWhere, status: "NO_ANSWER" } }),
      prisma.call.count({ where: { ...callWhere, status: "BUSY" } }),
      prisma.call.count({ where: { ...callWhere, status: "STOPPED" } }),
      prisma.call.aggregate({
        where: { ...callWhere, chargedAmount: { not: null } },
        _sum: { chargedAmount: true },
      }),
      prisma.call.aggregate({
        where: { ...callWhere, status: "COMPLETED", duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

    return {
      totalLeads: campaign.totalLeads,
      totalCalls,
      completedCalls,
      failedCalls,
      noAnswerCalls,
      busyCalls,
      stoppedCalls,
      totalCostPaisa: costAgg._sum.chargedAmount ?? 0,
      avgDurationSec: Math.round(durationAgg._avg.duration ?? 0),
    };
  }

  async findById(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignEntityData | null> {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId,
      },
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
      where: {
        id: campaignId,
        tenantId,
      },
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
        isDeleted: false,
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
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId, isDeleted: false },
      select: { id: true },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

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

    const dispositionIds = [...new Set(rows.map((r) => r.dispositionId))];
    const visibleDispositions = await prisma.extractionDisposition.findMany({
      where: { id: { in: dispositionIds }, showInOverview: true },
      select: { id: true, objectiveOptions: true },
    });
    const visibleIds = new Set(visibleDispositions.map((d) => d.id));

    const dispositionSortMap = new Map<string, Map<string, number>>();
    for (const d of visibleDispositions) {
      const optMap = new Map<string, number>();
      if (Array.isArray(d.objectiveOptions)) {
        (d.objectiveOptions as Array<{ value: string; sortOrder?: number }>).forEach(
          (opt, idx) => {
            if (opt?.value) {
              optMap.set(
                opt.value.trim().toLowerCase(),
                typeof opt.sortOrder === "number" ? opt.sortOrder : idx,
              );
            }
          },
        );
      }
      dispositionSortMap.set(d.id, optMap);
    }

    const filteredRows = rows.filter((r) => visibleIds.has(r.dispositionId));

    const totalCallsResult = await prisma.callExtractionOverview.findMany({
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
        dispositionId: { in: Array.from(visibleIds) },
      },
      select: { callId: true },
      distinct: ["callId"],
    });
    const totalCalls = totalCallsResult.length;

    const dispositionMap = new Map<
      string,
      {
        dispositionId: string;
        dispositionSlug: string;
        dispositionName: string;
        categoryName: string;
        values: Array<{
          value: string;
          count: number;
          percentage: number;
          sortOrder?: number;
        }>;
        totalCount: number;
      }
    >();

    for (const row of filteredRows) {
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

      const optSortMap = dispositionSortMap.get(row.dispositionId);
      const sortOrder =
        optSortMap?.get(row.objectiveValue.trim().toLowerCase()) ?? 0;

      const count = row._count;
      acc.totalCount += count;
      acc.values.push({
        value: row.objectiveValue,
        count,
        percentage: 0,
        sortOrder,
      });
    }

    const dispositions: ExtractionOverviewDisposition[] = [];
    for (const acc of dispositionMap.values()) {
      for (const v of acc.values) {
        v.percentage =
          acc.totalCount > 0
            ? parseFloat(((v.count / acc.totalCount) * 100).toFixed(1))
            : 0;
      }
      acc.values.sort((a, b) => {
        if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        }
        return b.count - a.count;
      });
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
      where: { id: campaignId, tenantId, isDeleted: false },
      select: { id: true },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

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

    const dispositionIds = [...new Set(rows.map((r) => r.dispositionId))];
    const visibleDispositions = await prisma.extractionDisposition.findMany({
      where: { id: { in: dispositionIds }, showInInsights: true },
      select: { id: true },
    });
    const visibleIds = new Set(visibleDispositions.map((d) => d.id));

    const filteredRows = rows.filter((r) => visibleIds.has(r.dispositionId));

    if (filteredRows.length === 0) {
      return { campaignId, totalCalls: 0, insights: [] };
    }

    const totalCallsResult = await prisma.callExtractionInsight.findMany({
      where: {
        tenantId,
        campaignId,
        ...(batchId && { batchId }),
        dispositionId: { in: Array.from(visibleIds) },
      },
      select: { callId: true },
      distinct: ["callId"],
    });
    const totalCalls = totalCallsResult.length;

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

    for (const row of filteredRows) {
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
      where: { id: assistantId, tenantId, isDeleted: false },
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

  async softDelete(
    tenantId: string,
    campaignId: string,
  ): Promise<{
    archivedCalls: number;
    archivedLeads: number;
    archivedBatches: number;
  }> {
    const now = new Date();

    const [, batchResult, leadResult, callResult] = await prisma.$transaction([
      // 1. Archive campaign
      prisma.campaign.update({
        where: { id: campaignId, tenantId },
        data: { isDeleted: true, deletedAt: now },
      }),
      // 2. Cascade to batches
      prisma.leadBatch.updateMany({
        where: { campaignId, tenantId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      }),
      // 3. Cascade to leads
      prisma.lead.updateMany({
        where: { campaignId, tenantId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      }),
      // 4. Cascade to calls
      prisma.call.updateMany({
        where: { campaignId, tenantId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      }),
    ]);

    return {
      archivedBatches: batchResult.count,
      archivedLeads: leadResult.count,
      archivedCalls: callResult.count,
    };
  }

  async restore(
    tenantId: string,
    campaignId: string,
  ): Promise<{
    restoredCalls: number;
    restoredLeads: number;
    restoredBatches: number;
  }> {
    const [, batchResult, leadResult, callResult] = await prisma.$transaction([
      // 1. Restore campaign
      prisma.campaign.update({
        where: { id: campaignId, tenantId },
        data: { isDeleted: false, deletedAt: null },
      }),
      // 2. Cascade restore batches
      prisma.leadBatch.updateMany({
        where: { campaignId, tenantId, isDeleted: true },
        data: { isDeleted: false, deletedAt: null },
      }),
      // 3. Cascade restore leads
      prisma.lead.updateMany({
        where: { campaignId, tenantId, isDeleted: true },
        data: { isDeleted: false, deletedAt: null },
      }),
      // 4. Cascade restore calls
      prisma.call.updateMany({
        where: { campaignId, tenantId, isDeleted: true },
        data: { isDeleted: false, deletedAt: null },
      }),
    ]);

    return {
      restoredBatches: batchResult.count,
      restoredLeads: leadResult.count,
      restoredCalls: callResult.count,
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
    isDeleted: boolean;
    deletedAt: Date | null;
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
      isDeleted: campaign.isDeleted,
      deletedAt: campaign.deletedAt,
    };
  }
}
