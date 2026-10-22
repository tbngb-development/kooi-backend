// modules/calls/infrastructure/repositories/prisma-call.repository.ts

import prisma from "../../../../shared/config/database/prisma";
import { type Prisma, type CallStatus } from "@prisma/client";
import type {
  CallRepository,
  ListCallsFilters,
  PaginatedCallsResult,
  DetailedCallResult,
  CallTranscriptResult,
  CallStatsFilters,
  CallStatsResult,
  CallCenterStatsResult,
} from "../../application/interfaces/call-repository.interface";
import type { AvailableFiltersResponse } from "../../../../shared/types/bolna.types";
import type { CallListOverview } from "../../../campaigns/application/dto/campaign.dto";

export class PrismaCallRepository implements CallRepository {
  async list(
    tenantId: string,
    filters: ListCallsFilters,
  ): Promise<PaginatedCallsResult> {
    const {
      campaignId,
      leadId,
      status,
      search,
      dateFrom,
      dateTo,
      sortBy = "duration",
      sortOrder = "desc",
      page = 1,
      limit = 15,
      isDeleted = false,
    } = filters;

    const pageNum = Math.max(1, page);
    const limitNum = Math.max(1, limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.CallWhereInput = { tenantId };

    where.isDeleted = isDeleted ?? false;

    if (campaignId) where.campaignId = campaignId;
    if (filters.assistantId) where.assistantId = filters.assistantId;
    if (filters.type) where.type = filters.type;
    if (filters.source) where.source = filters.source;
    if (filters.agentNumber) where.agentNumber = filters.agentNumber;
    if (leadId) where.leadId = leadId;

    if (status) {
      const statuses = status
        .split(",")
        .map((s) => s.trim() as CallStatus)
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    if (dateFrom || dateTo) {
      where.startedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    if (search) {
      where.OR = [
        {
          lead: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          },
        },
        { agentNumber: { contains: search } },
      ];
    }

    const dynamicAndConditions: Prisma.CallWhereInput[] = [];

    if (
      filters.dynamicFilters &&
      Object.keys(filters.dynamicFilters).length > 0
    ) {
      for (const [dispositionId, objectiveValue] of Object.entries(
        filters.dynamicFilters,
      )) {
        dynamicAndConditions.push({
          extractionOverview: {
            some: {
              dispositionId: dispositionId,
              objectiveValue,
            },
          },
        });
      }
    }

    if (dynamicAndConditions.length > 0) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        ...dynamicAndConditions,
      ];
    }

    const validSortFields = ["startedAt", "duration", "cost", "createdAt"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "startedAt";
    const orderDir: Prisma.SortOrder = sortOrder === "asc" ? "asc" : "desc";

    const orderBy: Prisma.CallOrderByWithRelationInput[] = (() => {
      switch (orderField) {
        case "duration":
          return [
            { duration: { sort: orderDir, nulls: "last" } },
            { createdAt: "desc" },
          ];
        case "cost":
          return [
            { cost: { sort: orderDir, nulls: "last" } },
            { createdAt: "desc" },
          ];
        case "startedAt":
          return [
            { startedAt: { sort: orderDir, nulls: "last" } },
            { createdAt: "desc" },
          ];
        case "createdAt":
        default:
          return [{ createdAt: orderDir }];
      }
    })();

    const [calls, total, overview] = await Promise.all([
      prisma.call.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          campaign: { select: { id: true, name: true } },
          assistant: { select: { id: true, name: true } },
          extractionOverview: {
            select: {
              dispositionSlug: true,
              dispositionName: true,
              categoryName: true,
              objectiveValue: true,
              confidence: true,
              sortOrder: true,
            },
            orderBy: {
              sortOrder: "asc",
            },
          },
          extractionInsights: {
            select: {
              dispositionSlug: true,
              dispositionName: true,
              categoryName: true,
              subjectiveValue: true,
              normalizedValue: true,
              confidence: true,
            },
          },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.call.count({ where }),
      this.getTenantCallOverview(tenantId, campaignId),
    ]);

    return {
      overview,
      calls: calls.map((c) => ({
        id: c.id,
        bolnaCallId: c.bolnaCallId,
        tenantId: c.tenantId,
        campaignId: c.campaignId,
        assistantId: c.assistantId,
        leadId: c.leadId,
        batchId: c.batchId,
        type: c.type,
        source: c.source,
        status: c.status as CallStatus,
        agentNumber: c.agentNumber,
        duration: c.duration,
        cost: c.cost,
        platformCost: c.platformCost,
        billableSeconds: c.billableSeconds,
        recording: c.recording,
        transcript: c.transcript,
        transcriptMessages: c.transcriptMessages,
        summary: c.summary,
        callHistory: c.callHistory,
        extractionResult: c.extractionResult as unknown as Record<string, any>,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        isDeleted: c.isDeleted,
        deletedAt: c.deletedAt,
        lead: c.lead,
        campaign: c.campaign,
        assistant: c.assistant,
        extractionOverview: c.extractionOverview,
        extractionInsights: c.extractionInsights,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  async getTenantCallOverview(
    tenantId: string,
    campaignId?: string,
  ): Promise<CallListOverview> {
    const where: Prisma.CallWhereInput = { tenantId, isDeleted: false };

    if (campaignId) where.campaignId = campaignId;

    const [
      totalCalls,
      completedCalls,
      failedCalls,
      scheduledCalls,
      busyCalls,
      noAnswerCalls,
      durationAgg,
      costAgg,
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: "COMPLETED" } }),
      prisma.call.count({ where: { ...where, status: "FAILED" } }),
      prisma.call.count({ where: { ...where, status: "SCHEDULED" } }),
      prisma.call.count({ where: { ...where, status: "BUSY" } }),
      prisma.call.count({ where: { ...where, status: "NO_ANSWER" } }),
      prisma.call.aggregate({
        where: { ...where, status: "COMPLETED", duration: { not: null } },
        _avg: { duration: true },
      }),
      prisma.call.aggregate({
        where: { ...where, chargedAmount: { not: null } },
        _sum: { chargedAmount: true },
      }),
    ]);

    return {
      totalCalls,
      completedCalls,
      failedCalls,
      scheduledCalls,
      busyCalls,
      noAnswerCalls,
      avgDurationSec: Math.round(durationAgg._avg.duration ?? 0),
      totalCostPaisa: costAgg._sum.chargedAmount ?? 0,
    };
  }

  async getCallCenterStats(tenantId: string): Promise<CallCenterStatsResult> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const baseWhere: Prisma.CallWhereInput = {
      tenantId,
      isDeleted: false,
    };

    const todayWhere: Prisma.CallWhereInput = {
      ...baseWhere,
      createdAt: { gte: todayStart },
    };

    const [
      todayInboundCalls,
      todayInboundCompleted,
      todayOutboundCalls,
      todayOutboundCompleted,
      durationAgg,
      costAgg,
      activeCallsCount,
    ] = await Promise.all([
      prisma.call.count({
        where: {
          ...todayWhere,
          OR: [{ source: "INBOUND" }, { type: "INBOUND" }],
        },
      }),
      prisma.call.count({
        where: {
          ...todayWhere,
          status: "COMPLETED",
          OR: [{ source: "INBOUND" }, { type: "INBOUND" }],
        },
      }),
      prisma.call.count({
        where: {
          ...todayWhere,
          source: "QUICK_DIAL",
        },
      }),
      prisma.call.count({
        where: {
          ...todayWhere,
          source: "QUICK_DIAL",
          status: "COMPLETED",
        },
      }),
      prisma.call.aggregate({
        where: {
          ...todayWhere,
          status: "COMPLETED",
          duration: { not: null },
        },
        _avg: { duration: true },
      }),
      prisma.call.aggregate({
        where: {
          ...todayWhere,
          platformCost: { not: null },
        },
        _sum: { platformCost: true },
      }),
      prisma.call.count({
        where: {
          ...baseWhere,
          status: { in: ["CALLING", "PENDING"] },
        },
      }),
    ]);

    return {
      todayInboundCalls,
      todayInboundCompleted,
      todayOutboundCalls,
      todayOutboundCompleted,
      todayAvgDurationSec: Math.round(durationAgg._avg.duration ?? 0),
      todayTotalCostPaisa: costAgg._sum.platformCost ?? 0,
      activeCallsCount,
    };
  }

  // Update the findById method inside the class to support explicit isDeleted filtering
  async findById(
    tenantId: string,
    id: string,
  ): Promise<DetailedCallResult | null> {
    const call = await prisma.call.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            company: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        assistant: {
          select: {
            id: true,
            name: true,
          },
        },
        callAnalysis: {
          select: {
            id: true,
            dynamicExtractions: true,
            extractionResult: true,
          },
        },
      },
    });

    if (!call) return null;

    return {
      id: call.id,
      bolnaCallId: call.bolnaCallId,
      tenantId: call.tenantId,
      campaignId: call.campaignId,
      assistantId: call.assistantId,
      leadId: call.leadId,
      batchId: call.batchId,
      type: call.type,
      source: call.source,
      status: call.status as CallStatus,
      duration: call.duration,
      cost: call.cost,
      platformCost: call.platformCost,
      billableSeconds: call.billableSeconds,
      recording: call.recording,
      transcript: call.transcript,
      transcriptMessages: call.transcriptMessages,
      summary: call.summary,
      callHistory: call.callHistory,
      extractionResult: call.extractionResult as unknown as Record<string, any>,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt,
      isDeleted: call.isDeleted,
      deletedAt: call.deletedAt,
      lead: call.lead,
      campaign: call.campaign,
      assistant: call.assistant,
      callAnalysis: call.callAnalysis
        ? {
            id: call.callAnalysis.id,
            dynamicExtractions: call.callAnalysis
              .dynamicExtractions as unknown as string,
            extractionResult: call.callAnalysis
              .extractionResult as unknown as string,
          }
        : null,
    };
  }

  async findTranscriptById(
    tenantId: string,
    id: string,
  ): Promise<CallTranscriptResult | null> {
    const call = await prisma.call.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: {
        transcript: true,
        transcriptMessages: true,
        summary: true,
        duration: true,
        recording: true,
        callAnalysis: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!call) return null;

    return {
      transcript: call.transcript,
      transcriptMessages: call.transcriptMessages,
      summary: call.summary,
      duration: call.duration,
      recording: call.recording,
      callAnalysis: call.callAnalysis
        ? {
            id: call.callAnalysis.id,
          }
        : null,
    };
  }

  async getStats(
    tenantId: string,
    filters: CallStatsFilters,
  ): Promise<CallStatsResult> {
    const { campaignId, leadId } = filters;

    const where: Prisma.CallWhereInput = {
      tenantId,
      isDeleted: false,
      ...(campaignId && { campaignId }),
      ...(leadId && { leadId }),
    };

    const [total, completed, failed, noAnswer, busy, durationAgg] =
      await Promise.all([
        prisma.call.count({ where }),
        prisma.call.count({ where: { ...where, status: "COMPLETED" } }),
        prisma.call.count({ where: { ...where, status: "FAILED" } }),
        prisma.call.count({ where: { ...where, status: "NO_ANSWER" } }),
        prisma.call.count({ where: { ...where, status: "BUSY" } }),
        prisma.call.aggregate({
          where: { ...where, status: "COMPLETED", duration: { not: null } },
          _avg: { duration: true },
        }),
      ]);

    return {
      total,
      completed,
      failed,
      noAnswer,
      busy,
      avgDuration: Math.round(durationAgg._avg.duration ?? 0),
    };
  }

  async getAvailableFilters(
    tenantId: string,
    campaignId: string,
  ): Promise<AvailableFiltersResponse> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId, isDeleted: false },
      select: {
        assistant: {
          select: {
            platformAgent: {
              select: {
                id: true,
                categories: {
                  select: {
                    category: {
                      select: {
                        name: true,
                        dispositions: {
                          select: {
                            disposition: {
                              select: {
                                id: true,
                                name: true,
                                slug: true,
                                isObjective: true,
                                objectiveOptions: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const agent = campaign?.assistant?.platformAgent;
    if (!agent) {
      return { dynamic: [] };
    }

    const seen = new Set<string>();
    const dynamic: AvailableFiltersResponse["dynamic"] = [];

    for (const catRel of agent.categories) {
      const categoryName = catRel.category.name;

      for (const dispRel of catRel.category.dispositions) {
        const disp = dispRel.disposition;

        if (!disp.isObjective) continue;
        if (seen.has(disp.slug)) continue;
        seen.add(disp.slug);

        const options = this.flattenObjectiveValues(
          disp.objectiveOptions as Array<{
            value: string;
            sub_options?: unknown[];
          }> | null,
        );

        if (options.length === 0) continue;

        dynamic.push({
          id: disp.id,
          label: disp.name,
          disposition: disp.name,
          category: categoryName,
          options,
        });
      }
    }

    return { dynamic };
  }

  async softDelete(callId: string): Promise<void> {
    await prisma.call.update({
      where: { id: callId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async restore(callId: string): Promise<void> {
    await prisma.call.update({
      where: { id: callId },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
    });
  }

  private flattenObjectiveValues(
    options: Array<{
      value: string;
      sortOrder?: number;
      sub_options?: unknown[];
    }> | null,
  ): string[] {
    if (!options) return [];

    const sortedOptions = [...options].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );

    const values: string[] = [];
    for (const opt of sortedOptions) {
      values.push(opt.value);
      if (opt.sub_options && Array.isArray(opt.sub_options)) {
        values.push(
          ...this.flattenObjectiveValues(
            opt.sub_options as Array<{
              value: string;
              sortOrder?: number;
              sub_options?: unknown[];
            }>,
          ),
        );
      }
    }
    return values;
  }

  async createInboundCallRecord(data: {
    bolnaCallId: string;
    tenantId: string;
    assistantId: string;
    leadId: string;
  }): Promise<void> {
    await prisma.call.create({
      data: {
        bolnaCallId: data.bolnaCallId,
        tenantId: data.tenantId,
        assistantId: data.assistantId,
        leadId: data.leadId,
        type: "INBOUND",
        source: "INBOUND",
        status: "CALLING",
        startedAt: new Date(),
      },
    });
  }

  async createQuickDialCallRecord(data: {
    bolnaCallId: string;
    tenantId: string;
    assistantId: string;
    leadId: string;
    agentNumber: string | null;
  }): Promise<{ id: string }> {
    return prisma.call.create({
      data: {
        bolnaCallId: data.bolnaCallId,
        tenantId: data.tenantId,
        assistantId: data.assistantId,
        leadId: data.leadId,
        type: "OUTBOUND",
        source: "QUICK_DIAL",
        status: "PENDING",
        agentNumber: data.agentNumber,
      },
      select: { id: true },
    });
  }
}
