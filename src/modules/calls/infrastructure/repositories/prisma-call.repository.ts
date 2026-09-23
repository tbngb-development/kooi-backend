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
} from "../../application/interfaces/call-repository.interface";
import type { AvailableFiltersResponse } from "../../../../shared/types/bolna.types";

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
      sortBy = "startedAt",
      sortOrder = "desc",
      page = 1,
      limit = 15,
    } = filters;

    const pageNum = Math.max(1, page);
    const limitNum = Math.max(1, limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.CallWhereInput = { tenantId };

    if (campaignId) where.campaignId = campaignId;
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
      where.lead = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      };
    }

    // ── [REWRITTEN] Dynamic Filters via normalized extraction tables ──
    // Each filter entry maps to a CallExtractionOverview row (objective/metric values)
    // e.g. { "lead_temperature": "HOT", "location_match": "MATCH" }
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
    const orderDir = sortOrder === "asc" ? "asc" : "desc";

    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          campaign: { select: { id: true, name: true } },
          // [UPDATED] Replaced old callAnalysis hardcoded fields with normalized tables
          extractionOverview: {
            select: {
              dispositionSlug: true,
              dispositionName: true,
              categoryName: true,
              objectiveValue: true,
              confidence: true,
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
        orderBy: { [orderField]: orderDir },
        skip,
        take: limitNum,
      }),
      prisma.call.count({ where }),
    ]);

    return {
      calls: calls.map((c) => ({
        id: c.id,
        bolnaCallId: c.bolnaCallId,
        tenantId: c.tenantId,
        campaignId: c.campaignId,
        leadId: c.leadId,
        batchId: c.batchId,
        status: c.status as CallStatus,
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
        lead: c.lead,
        campaign: c.campaign,
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

  async findById(
    tenantId: string,
    id: string,
  ): Promise<DetailedCallResult | null> {
    const call = await prisma.call.findFirst({
      where: { id, tenantId },
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
        callAnalysis: true,
      },
    });

    if (!call) return null;

    return {
      id: call.id,
      bolnaCallId: call.bolnaCallId,
      tenantId: call.tenantId,
      campaignId: call.campaignId,
      leadId: call.leadId,
      batchId: call.batchId,
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
      lead: call.lead,
      campaign: call.campaign,
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
      where: { id, tenantId },
      select: {
        transcript: true,
        transcriptMessages: true,
        summary: true,
        duration: true,
        recording: true,
        callAnalysis: {
          select: {
            id: true,
            disposition: true,
            leadTemperature: true,
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
    // ── Single query: resolve agent + all assigned dispositions ────────
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
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

    // ── In-memory: flatten categories → dispositions, deduplicate ──────
    const seen = new Set<string>();
    const dynamic: AvailableFiltersResponse["dynamic"] = [];

    for (const catRel of agent.categories) {
      const categoryName = catRel.category.name;

      for (const dispRel of catRel.category.dispositions) {
        const disp = dispRel.disposition;

        // Skip non-objective dispositions (no predefined values to filter by)
        if (!disp.isObjective) continue;

        // Deduplicate across categories
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

  private flattenObjectiveValues(
    options: Array<{ value: string; sub_options?: unknown[] }> | null,
  ): string[] {
    if (!options) return [];

    const values: string[] = [];
    for (const opt of options) {
      values.push(opt.value);
      if (opt.sub_options && Array.isArray(opt.sub_options)) {
        values.push(
          ...this.flattenObjectiveValues(
            opt.sub_options as Array<{
              value: string;
              sub_options?: unknown[];
            }>,
          ),
        );
      }
    }
    return values;
  }
}
