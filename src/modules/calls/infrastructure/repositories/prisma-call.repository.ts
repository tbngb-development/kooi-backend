import prisma from "../../../../shared/config/database/prisma";
import {
  type Prisma,
  type CallStatus,
  type Disposition,
  type LeadTemperature,
  type LocationMatch,
} from "@prisma/client";
import type {
  CallRepository,
  ListCallsFilters,
  PaginatedCallsResult,
  DetailedCallResult,
  CallTranscriptResult,
  CallStatsFilters,
  CallStatsResult,
} from "../../application/interfaces/call-repository.interface";
import type {
  AvailableFiltersResponse,
  DynamicFilterMap,
  ExtractionConfig,
  ExtractionResponse,
} from "../../../../shared/types/bolna.types";

const QUALIFYING_DISPOSITIONS: Disposition[] = [
  "QUALIFIED_CONSULTANT_FOLLOWUP",
  "SITE_VISIT_INTEREST",
  "INTERESTED_SEND_DETAILS",
  "INTERESTED_GENERAL",
];

export class PrismaCallRepository implements CallRepository {
  async list(
    tenantId: string,
    filters: ListCallsFilters,
  ): Promise<PaginatedCallsResult> {
    const {
      campaignId,
      leadId,
      status,
      disposition,
      leadTemperature,
      locationMatch,
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

    const callAnalysisWhere: Prisma.CallAnalysisWhereInput = {};

    if (disposition) {
      const disps = disposition
        .split(",")
        .map((d) => d.trim() as Disposition)
        .filter(Boolean);
      callAnalysisWhere.disposition =
        disps.length > 1 ? { in: disps } : disps[0];
    }

    if (leadTemperature) {
      const temps = leadTemperature
        .split(",")
        .map((t) => t.trim() as LeadTemperature)
        .filter(Boolean);
      callAnalysisWhere.leadTemperature =
        temps.length > 1 ? { in: temps } : temps[0];
    }

    if (locationMatch) {
      const matches = locationMatch
        .split(",")
        .map((m) => m.trim() as LocationMatch)
        .filter(Boolean);
      callAnalysisWhere.locationMatch =
        matches.length > 1 ? { in: matches } : matches[0];
    }

    if (Object.keys(callAnalysisWhere).length > 0) {
      where.callAnalysis = callAnalysisWhere;
    }

    if (search) {
      where.lead = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      };
    }

    if (filters.metricKey && filters.metricValue) {
      where.callMetrics = {
        some: {
          metricKey: filters.metricKey,
          actualValue: filters.metricValue,
        },
      };
    }
    // [NEW] Dynamic JSONB filters on extractionResponse.metrics
    const dynamicAndConditions: Prisma.CallWhereInput[] = [];

    if (
      filters.dynamicFilters &&
      Object.keys(filters.dynamicFilters).length > 0
    ) {
      for (const [dispositionName, actualValue] of Object.entries(
        filters.dynamicFilters,
      )) {
        dynamicAndConditions.push({
          callAnalysis: {
            extractionResponse: {
              path: ["metrics"],
              array_contains: [{ disposition: dispositionName, actualValue }],
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
          callAnalysis: {
            select: {
              id: true,
              disposition: true,
              leadTemperature: true,
              preferredConfiguration: true,
              budgetRange: true,
              purchaseTimeline: true,
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
        callAnalysis: c.callAnalysis
          ? {
              id: c.callAnalysis.id,
              disposition: c.callAnalysis.disposition as Disposition | null,
              leadTemperature: c.callAnalysis
                .leadTemperature as LeadTemperature | null,
              preferredConfiguration: c.callAnalysis.preferredConfiguration,
              budgetRange: c.callAnalysis.budgetRange,
              purchaseTimeline: c.callAnalysis.purchaseTimeline
                ? String(c.callAnalysis.purchaseTimeline)
                : null,
            }
          : null,
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
            disposition: call.callAnalysis.disposition as Disposition | null,
            leadTemperature: call.callAnalysis
              .leadTemperature as LeadTemperature | null,
            preferredConfiguration: call.callAnalysis.preferredConfiguration,
            budgetRange: call.callAnalysis.budgetRange,
            purchaseTimeline: call.callAnalysis.purchaseTimeline
              ? String(call.callAnalysis.purchaseTimeline)
              : null,
            purchasePurpose: call.callAnalysis.purchasePurpose
              ? String(call.callAnalysis.purchasePurpose)
              : null,
            locationMatch: call.callAnalysis
              .locationMatch as LocationMatch | null,
            customerLocationPref: call.callAnalysis.customerLocationPref,
            preferredNextAction: call.callAnalysis.preferredNextAction
              ? String(call.callAnalysis.preferredNextAction)
              : null,
            preferredContactChannel: call.callAnalysis.preferredContactChannel
              ? String(call.callAnalysis.preferredContactChannel)
              : null,
            followupSchedule: call.callAnalysis.followupSchedule,
            doNotCall: call.callAnalysis.doNotCall
              ? String(call.callAnalysis.doNotCall)
              : null,
            languageSupportRequired: call.callAnalysis.languageSupportRequired
              ? String(call.callAnalysis.languageSupportRequired)
              : null,
            dynamicExtractions: call.callAnalysis
              .dynamicExtractions as unknown as string,
            extractionResult: call.callAnalysis
              .extractionResult as unknown as string,
            extractionResponse: call.callAnalysis
              .extractionResponse as unknown as string,
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
            disposition: call.callAnalysis.disposition as Disposition | null,
            leadTemperature: call.callAnalysis
              .leadTemperature as LeadTemperature | null,
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

    const [
      total,
      completed,
      failed,
      noAnswer,
      busy,
      durationAgg,
      dispositionGroups,
      temperatureGroups,
      qualifiedCount,
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: "COMPLETED" } }),
      prisma.call.count({ where: { ...where, status: "FAILED" } }),
      prisma.call.count({ where: { ...where, status: "NO_ANSWER" } }),
      prisma.call.count({ where: { ...where, status: "BUSY" } }),

      prisma.call.aggregate({
        where: { ...where, status: "COMPLETED", duration: { not: null } },
        _avg: { duration: true },
      }),

      prisma.callAnalysis.groupBy({
        by: ["disposition"],
        where: {
          tenantId,
          ...(campaignId && { call: { campaignId } }),
          ...(leadId && { call: { leadId } }),
          disposition: { not: null },
        },
        _count: true,
      }),

      prisma.callAnalysis.groupBy({
        by: ["leadTemperature"],
        where: {
          tenantId,
          ...(campaignId && { call: { campaignId } }),
          ...(leadId && { call: { leadId } }),
          leadTemperature: { not: null },
        },
        _count: true,
      }),

      prisma.callAnalysis.count({
        where: {
          tenantId,
          ...(campaignId && { call: { campaignId } }),
          ...(leadId && { call: { leadId } }),
          disposition: { in: QUALIFYING_DISPOSITIONS },
        },
      }),
    ]);

    const dispositionBreakdown: Record<string, number> = {};
    for (const g of dispositionGroups) {
      if (g.disposition) {
        dispositionBreakdown[g.disposition] = g._count;
      }
    }

    const temperatureBreakdown: Record<string, number> = {};
    for (const g of temperatureGroups) {
      if (g.leadTemperature) {
        temperatureBreakdown[g.leadTemperature] = g._count;
      }
    }

    const qualificationRate =
      total > 0 ? ((qualifiedCount / total) * 100).toFixed(1) + "%" : "0%";

    return {
      total,
      completed,
      failed,
      noAnswer,
      busy,
      avgDuration: Math.round(durationAgg._avg.duration ?? 0),
      qualifiedCount,
      qualificationRate,
      dispositionBreakdown,
      temperatureBreakdown,
    };
  }

  async getExtractionResponse(
    tenantId: string,
    callId: string,
  ): Promise<ExtractionResponse | null> {
    const call = await prisma.call.findFirst({
      where: {
        id: callId,
        tenantId,
      },
      select: {
        callAnalysis: {
          select: {
            extractionResponse: true,
          },
        },
      },
    });

    if (!call?.callAnalysis?.extractionResponse) return null;

    return call.callAnalysis
      .extractionResponse as unknown as ExtractionResponse;
  }

  async getAvailableFilters(
    tenantId: string,
    campaignId: string,
  ): Promise<AvailableFiltersResponse> {
    const legacy = {
      disposition: [
        "INTERESTED_SEND_DETAILS",
        "QUALIFIED_CONSULTANT_FOLLOWUP",
        "SITE_VISIT_INTEREST",
        "INTERESTED_GENERAL",
        "FOLLOWUP_REQUESTED",
        "NOT_INTERESTED",
        "DO_NOT_CALL",
        "WRONG_NUMBER",
        "ALREADY_PURCHASED",
        "BROKER",
        "LANGUAGE_CALLBACK_REQUIRED",
        "CALL_ENDED_BY_CUSTOMER",
        "CALL_ENDED_ABUSIVE",
        "NO_RESPONSE",
        "CALL_DROPPED",
      ],
      leadTemperature: ["HOT", "WARM", "NURTURE", "COLD", "NOT_APPLICABLE"],
      locationMatch: ["MATCH", "MISMATCH", "NOT_ASKED", "NOT_MENTIONED"],
    };

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
      return { legacy, dynamic: [] };
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
          label: disp.name,
          disposition: disp.name,
          category: categoryName,
          type: "metric",
          options,
        });
      }
    }

    return { legacy, dynamic };
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
