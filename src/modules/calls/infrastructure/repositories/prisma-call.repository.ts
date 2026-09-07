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
}
