import type {
  CallStatus,
  Disposition,
  LeadStatus,
  Prisma,
} from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type {
  LeadRepository,
  ListLeadsFilters,
  PaginatedLeadsResult,
  DetailedLeadResult,
  LeadStatsResult,
} from "../../application/interfaces/lead-repository.interface";

const QUALIFYING_DISPOSITIONS: Disposition[] = [
  "QUALIFIED_CONSULTANT_FOLLOWUP",
  "SITE_VISIT_INTEREST",
  "INTERESTED_SEND_DETAILS",
  "INTERESTED_GENERAL",
];

export class PrismaLeadRepository implements LeadRepository {
  async list(
    tenantId: string,
    filters: ListLeadsFilters,
  ): Promise<PaginatedLeadsResult> {
    const {
      campaignId,
      status,
      dateFrom,
      dateTo,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = filters;

    const pageNum = Math.max(1, page);
    const limitNum = Math.max(1, limit);
    const skip = (pageNum - 1) * limitNum;

    // Structured type-safe Prisma Filter Query Construction
    const where: Prisma.LeadWhereInput = {
      tenantId,
      ...(campaignId && { campaignId }),
    };

    if (status) {
      const statuses = status
        .split(",")
        .map((s) => s.trim() as LeadStatus)
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    // Explicit sorting fields whitelist checking
    const validSortFields = ["createdAt", "name", "updatedAt"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [orderField]: orderDir },
        include: {
          campaign: { select: { id: true, name: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const pages = Math.ceil(total / limitNum);

    return {
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        company: l.company,
        status: l.status as LeadStatus,
        doNotCall: l.doNotCall,
        tenantId: l.tenantId,
        campaignId: l.campaignId,
        batchId: l.batchId,
        metadata: l.metadata as Record<string, unknown> | null,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        campaign: l.campaign,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages,
      },
    };
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<DetailedLeadResult | null> {
    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
          },
        },
        calls: {
          orderBy: { createdAt: "desc" },
          include: {
            callAnalysis: {
              select: {
                id: true,
                disposition: true,
                leadTemperature: true,
                preferredConfiguration: true,
                budgetRange: true,
                purchaseTimeline: true,
                preferredNextAction: true,
              },
            },
          },
        },
      },
    });

    if (!lead) return null;

    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      status: lead.status as LeadStatus,
      doNotCall: lead.doNotCall,
      tenantId: lead.tenantId,
      campaignId: lead.campaignId,
      batchId: lead.batchId,
      metadata: lead.metadata as Record<string, unknown> | null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      campaign: lead.campaign,
      calls: lead.calls.map((c) => ({
        id: c.id,
        bolnaCallId: c.bolnaCallId,
        status: c.status as CallStatus,
        duration: c.duration,
        cost: c.cost,
        recording: c.recording,
        transcript: c.transcript,
        summary: c.summary,
        createdAt: c.createdAt,
        callAnalysis: c.callAnalysis
          ? {
              id: c.callAnalysis.id,
              disposition: c.callAnalysis.disposition as Disposition | null,
              leadTemperature: c.callAnalysis.leadTemperature,
              preferredConfiguration: c.callAnalysis.preferredConfiguration,
              budgetRange: c.callAnalysis.budgetRange,
              purchaseTimeline: c.callAnalysis.purchaseTimeline,
              preferredNextAction: c.callAnalysis.preferredNextAction,
            }
          : null,
      })),
    };
  }

  async getStats(
    tenantId: string,
    campaignId?: string,
  ): Promise<LeadStatsResult> {
    const where: Prisma.LeadWhereInput = {
      tenantId,
      ...(campaignId && { campaignId }),
    };

    const [
      total,
      pending,
      calling,
      called,
      failed,
      noAnswer,
      doNotCallCount,
      qualifiedCount,
    ] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.count({ where: { ...where, status: "PENDING" } }),
      prisma.lead.count({ where: { ...where, status: "CALLING" } }),
      prisma.lead.count({ where: { ...where, status: "CALLED" } }),
      prisma.lead.count({ where: { ...where, status: "FAILED" } }),
      prisma.lead.count({ where: { ...where, status: "NO_ANSWER" } }),
      prisma.lead.count({ where: { ...where, doNotCall: true } }),

      // Qualified count pulled using CallAnalysis schema references
      prisma.callAnalysis.count({
        where: {
          tenantId,
          disposition: { in: QUALIFYING_DISPOSITIONS },
          ...(campaignId && { call: { campaignId } }),
        },
      }),
    ]);

    const qualificationRate =
      total > 0 ? ((qualifiedCount / total) * 100).toFixed(1) + "%" : "0%";

    return {
      total,
      pending,
      calling,
      called,
      failed,
      noAnswer,
      doNotCall: doNotCallCount,
      qualified: qualifiedCount,
      qualificationRate,
    };
  }
}
