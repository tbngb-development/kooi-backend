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
      sortBy = "startedAt",
      sortOrder = "desc",
      page = 1,
      limit = 15,
      includeDeleted = false,
    } = filters;

    const pageNum = Math.max(1, page);
    const limitNum = Math.max(1, limit);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.CallWhereInput = { tenantId };

    if (!includeDeleted) {
      where.isDeleted = false;
    }

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

    const [calls, total, overview] = await Promise.all([
      prisma.call.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          campaign: { select: { id: true, name: true } },
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
      this.getTenantCallOverview(tenantId),
    ]);

    return {
      overview,
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
        isDeleted: c.isDeleted,
        deletedAt: c.deletedAt,
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

  async getTenantCallOverview(tenantId: string): Promise<CallListOverview> {
    const where = { tenantId, isDeleted: false };

    const [totalCalls, completedCalls, failedCalls, durationAgg, costAgg] =
      await Promise.all([
        prisma.call.count({ where }),
        prisma.call.count({ where: { ...where, status: "COMPLETED" } }),
        prisma.call.count({ where: { ...where, status: "FAILED" } }),
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
      avgDurationSec: Math.round(durationAgg._avg.duration ?? 0),
      totalCostPaisa: costAgg._sum.chargedAmount ?? 0,
    };
  }

  async findById(
    tenantId: string,
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DetailedCallResult | null> {
    const call = await prisma.call.findFirst({
      where: {
        id,
        tenantId,
        ...(options?.includeDeleted ? {} : { isDeleted: false }),
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
      isDeleted: call.isDeleted,
      deletedAt: call.deletedAt,
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

  async findInboundLeadContext(agentId: string, phone: string) {
    // Generate phone variations to match against whatever format is stored
    const digits = phone.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    const candidatePhones = Array.from(
      new Set([phone, `+91${last10}`, `91${last10}`, last10]),
    ).filter(Boolean);

    const lead = await prisma.lead.findFirst({
      where: {
        phone: { in: candidatePhones },
        isDeleted: false,
        campaign: {
          isDeleted: false,
          assistant: {
            isDeleted: false,
            platformAgent: {
              bolnaId: agentId,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        company: true,
        metadata: true,
        campaign: {
          select: {
            id: true,
            name: true,
            variables: true,
            tenantId: true,
          },
        },
      },
    });

    if (!lead || !lead.campaign) return null;

    return {
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        metadata: lead.metadata as Record<string, unknown> | null,
      },
      campaign: {
        id: lead.campaign.id,
        name: lead.campaign.name,
        variables: lead.campaign.variables as Record<string, string> | null,
        tenantId: lead.campaign.tenantId,
      },
    };
  }
}
