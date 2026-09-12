import prisma from "../../../../shared/config/database/prisma";
import { Prisma, type Disposition } from "@prisma/client";
import type { DashboardRepository } from "../../application/interfaces/dashboard-repository.interface";
import type {
  TenantOverviewOutput,
  CallTrendsOutput,
  SpendTrendsOutput,
  LeadFunnelOutput,
  DispositionBreakdownOutput,
  TemperatureDistributionOutput,
  TopCampaignsOutput,
  TopCampaignMetric,
  RecentActivityOutput,
  DashboardFilters,
  TimeSeriesFilters,
  CallTrendBucket,
  SpendTrendBucket,
} from "../../application/dto/dashboard.dto";
import {
  PG_GRANULARITY,
  generateDateBuckets,
  toDateString,
} from "../../domain/rules/date-range.rules";

// ── Constants ───────────────────────────────────────────────────────────────

const QUALIFYING_DISPOSITIONS: Disposition[] = [
  "QUALIFIED_CONSULTANT_FOLLOWUP",
  "SITE_VISIT_INTEREST",
  "INTERESTED_SEND_DETAILS",
  "INTERESTED_GENERAL",
];

const DISQUALIFYING_DISPOSITIONS: Disposition[] = [
  "NOT_INTERESTED",
  "DO_NOT_CALL",
  "WRONG_NUMBER",
  "ALREADY_PURCHASED",
  "BROKER",
  "CALL_ENDED_ABUSIVE",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function campaignFilter(campaignId?: string) {
  return campaignId
    ? Prisma.sql`AND "campaignId" = ${campaignId}`
    : Prisma.empty;
}

// ── Raw query row types ─────────────────────────────────────────────────────

interface RawTrendRow {
  bucket: Date | string;
  total: number;
  completed: number;
  failed: number;
  no_answer: number;
}

interface RawSpendRow {
  bucket: Date | string;
  cash_spent: number;
  bonus_spent: number;
}

interface RawGroupCount {
  key: string;
  count: number;
}

// ── Repository ──────────────────────────────────────────────────────────────

export class PrismaDashboardRepository implements DashboardRepository {
  // ── Overview ────────────────────────────────────────────────────────────

  async getOverview(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<TenantOverviewOutput> {
    const { dateFrom, dateTo, campaignId } = filters;
    const callWhere = {
      tenantId,
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(campaignId ? { campaignId } : {}),
    };

    const [
      totalCampaigns,
      activeCampaigns,
      totalLeads,
      totalCalls,
      completedCalls,
      failedCalls,
      noAnswerCalls,
      qualifiedCount,
      notQualifiedCount,
      spendAgg,
    ] = await Promise.all([
      prisma.campaign.count({ where: { tenantId } }),
      prisma.campaign.count({ where: { tenantId, status: "RUNNING" } }),
      prisma.lead.count({
        where: {
          tenantId,
          createdAt: { gte: dateFrom, lte: dateTo },
          ...(campaignId ? { campaignId } : {}),
        },
      }),
      prisma.call.count({ where: callWhere }),
      prisma.call.count({ where: { ...callWhere, status: "COMPLETED" } }),
      prisma.call.count({ where: { ...callWhere, status: "FAILED" } }),
      prisma.call.count({ where: { ...callWhere, status: "NO_ANSWER" } }),
      prisma.callAnalysis.count({
        where: {
          tenantId,
          disposition: { in: QUALIFYING_DISPOSITIONS },
          call: {
            createdAt: { gte: dateFrom, lte: dateTo },
            ...(campaignId ? { campaignId } : {}),
          },
        },
      }),
      prisma.callAnalysis.count({
        where: {
          tenantId,
          disposition: { in: DISQUALIFYING_DISPOSITIONS },
          call: {
            createdAt: { gte: dateFrom, lte: dateTo },
            ...(campaignId ? { campaignId } : {}),
          },
        },
      }),
      prisma.call.aggregate({
        where: { ...callWhere, status: "COMPLETED" },
        _sum: { chargedAmount: true },
      }),
    ]);

    const totalSpend = spendAgg._sum.chargedAmount ?? 0;

    return {
      campaigns: { total: totalCampaigns, active: activeCampaigns },
      leads: {
        total: totalLeads,
        qualified: qualifiedCount,
        notQualified: notQualifiedCount,
        qualificationRate: safeRate(qualifiedCount, totalLeads),
      },
      calls: {
        total: totalCalls,
        completed: completedCalls,
        failed: failedCalls,
        noAnswer: noAnswerCalls,
      },
      spend: {
        totalPaisa: totalSpend,
        avgCostPerQualifiedLeadPaisa:
          qualifiedCount > 0 ? Math.round(totalSpend / qualifiedCount) : 0,
      },
    };
  }

  // ── Call Trends ─────────────────────────────────────────────────────────

  async getCallTrends(
    tenantId: string,
    filters: TimeSeriesFilters,
  ): Promise<CallTrendsOutput> {
    const { dateFrom, dateTo, campaignId, granularity } = filters;
    const pgGran = PG_GRANULARITY[granularity];

    const rows = await prisma.$queryRaw<RawTrendRow[]>`
      SELECT
        date_trunc(${Prisma.raw(`'${pgGran}'`)}, "createdAt")::date as bucket,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int as failed,
        COUNT(*) FILTER (WHERE status = 'NO_ANSWER')::int as no_answer
      FROM "Call"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${dateFrom}
        AND "createdAt" <= ${dateTo}
        ${campaignFilter(campaignId)}
      GROUP BY bucket
      ORDER BY bucket
    `;

    const dbMap = new Map(rows.map((r) => [toDateString(r.bucket), r]));
    const buckets = generateDateBuckets(dateFrom, dateTo, granularity);

    const data: CallTrendBucket[] = buckets.map((date) => {
      const row = dbMap.get(date);
      return {
        date,
        total: row?.total ?? 0,
        completed: row?.completed ?? 0,
        failed: row?.failed ?? 0,
        noAnswer: row?.no_answer ?? 0,
      };
    });

    return { granularity, data };
  }

  // ── Spend Trends ────────────────────────────────────────────────────────

  async getSpendTrends(
    tenantId: string,
    filters: TimeSeriesFilters,
  ): Promise<SpendTrendsOutput> {
    const { dateFrom, dateTo, granularity } = filters;
    const pgGran = PG_GRANULARITY[granularity];

    const rows = await prisma.$queryRaw<RawSpendRow[]>`
      SELECT
        date_trunc(${Prisma.raw(`'${pgGran}'`)}, "createdAt")::date as bucket,
        COALESCE(SUM(ABS("cashDelta")), 0)::int as cash_spent,
        COALESCE(SUM(ABS("bonusDelta")), 0)::int as bonus_spent
      FROM "WalletTransaction"
      WHERE "tenantId" = ${tenantId}
        AND type = 'DEBIT'
        AND "sourceType" = 'CALL'
        AND "createdAt" >= ${dateFrom}
        AND "createdAt" <= ${dateTo}
      GROUP BY bucket
      ORDER BY bucket
    `;

    const dbMap = new Map(rows.map((r) => [toDateString(r.bucket), r]));
    const buckets = generateDateBuckets(dateFrom, dateTo, granularity);

    const data: SpendTrendBucket[] = buckets.map((date) => {
      const row = dbMap.get(date);
      const cash = row?.cash_spent ?? 0;
      const bonus = row?.bonus_spent ?? 0;
      return {
        date,
        cashSpentPaisa: cash,
        bonusSpentPaisa: bonus,
        totalSpentPaisa: cash + bonus,
      };
    });

    return { granularity, data };
  }

  // ── Lead Funnel ─────────────────────────────────────────────────────────

  async getLeadFunnel(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<LeadFunnelOutput> {
    const { dateFrom, dateTo, campaignId } = filters;
    const leadWhere = {
      tenantId,
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(campaignId ? { campaignId } : {}),
    };
    const callWhere = {
      tenantId,
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(campaignId ? { campaignId } : {}),
    };

    const [totalLeads, calledLeadIds, completedLeadIds, qualifiedLeadIds] =
      await Promise.all([
        prisma.lead.count({ where: leadWhere }),

        prisma.call
          .findMany({
            where: callWhere,
            select: { leadId: true },
            distinct: ["leadId"],
          })
          .then((rows) => new Set(rows.map((r) => r.leadId))),

        prisma.call
          .findMany({
            where: { ...callWhere, status: "COMPLETED" },
            select: { leadId: true },
            distinct: ["leadId"],
          })
          .then((rows) => new Set(rows.map((r) => r.leadId))),

        prisma.call
          .findMany({
            where: {
              ...callWhere,
              callAnalysis: { disposition: { in: QUALIFYING_DISPOSITIONS } },
            },
            select: { leadId: true },
            distinct: ["leadId"],
          })
          .then((rows) => new Set(rows.map((r) => r.leadId))),
      ]);

    const called = calledLeadIds.size;
    const completed = completedLeadIds.size;
    const qualified = qualifiedLeadIds.size;

    return {
      totalLeads,
      calledLeads: called,
      completedLeads: completed,
      qualifiedLeads: qualified,
      rates: {
        callRate: safeRate(called, totalLeads),
        completionRate: safeRate(completed, called),
        qualificationRate: safeRate(qualified, completed),
      },
    };
  }

  // ── Disposition Breakdown ───────────────────────────────────────────────

  async getDispositionBreakdown(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DispositionBreakdownOutput> {
    const { dateFrom, dateTo, campaignId } = filters;

    const rows = await prisma.$queryRaw<RawGroupCount[]>`
      SELECT ca.disposition as key, COUNT(*)::int as count
      FROM "CallAnalysis" ca
      JOIN "Call" c ON c.id = ca."callId"
      WHERE ca."tenantId" = ${tenantId}
        AND ca.disposition IS NOT NULL
        AND c."createdAt" >= ${dateFrom}
        AND c."createdAt" <= ${dateTo}
        ${campaignFilter(campaignId)}
      GROUP BY ca.disposition
      ORDER BY count DESC
    `;

    const total = rows.reduce((sum, r) => sum + r.count, 0);

    return {
      total,
      data: rows.map((r) => ({
        disposition: r.key,
        count: r.count,
        percentage: safeRate(r.count, total),
      })),
    };
  }

  // ── Temperature Distribution ────────────────────────────────────────────

  async getTemperatureDistribution(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<TemperatureDistributionOutput> {
    const { dateFrom, dateTo, campaignId } = filters;

    const rows = await prisma.$queryRaw<RawGroupCount[]>`
      SELECT ca."leadTemperature" as key, COUNT(*)::int as count
      FROM "CallAnalysis" ca
      JOIN "Call" c ON c.id = ca."callId"
      WHERE ca."tenantId" = ${tenantId}
        AND ca."leadTemperature" IS NOT NULL
        AND c."createdAt" >= ${dateFrom}
        AND c."createdAt" <= ${dateTo}
        ${campaignFilter(campaignId)}
      GROUP BY ca."leadTemperature"
      ORDER BY count DESC
    `;

    const total = rows.reduce((sum, r) => sum + r.count, 0);

    return {
      total,
      data: rows.map((r) => ({
        temperature: r.key,
        count: r.count,
        percentage: safeRate(r.count, total),
      })),
    };
  }

  // ── Top Campaigns ───────────────────────────────────────────────────────

  async getTopCampaigns(
    tenantId: string,
    filters: DashboardFilters,
    metric: TopCampaignMetric,
    limit: number,
  ): Promise<TopCampaignsOutput> {
    const { dateFrom, dateTo, campaignId } = filters;

    let orderByClause: Prisma.Sql;
    switch (metric) {
      case "qualified_leads":
        orderByClause = Prisma.sql`qualified_count DESC`;
        break;
      case "total_calls":
        orderByClause = Prisma.sql`call_count DESC`;
        break;
      case "total_spend":
        orderByClause = Prisma.sql`total_spend DESC`;
        break;
    }

    const rows = await prisma.$queryRaw<
      { id: string; name: string; value: number }[]
    >`
      SELECT
        cmp.id,
        cmp.name,
        CASE
          WHEN ${Prisma.raw(`'${metric}'`)} = 'qualified_leads'
            THEN COALESCE(qual.qualified_count, 0)::int
          WHEN ${Prisma.raw(`'${metric}'`)} = 'total_calls'
            THEN COALESCE(calls.call_count, 0)::int
          ELSE COALESCE(spend.total_spend, 0)::int
        END as value
      FROM "Campaign" cmp
      LEFT JOIN (
        SELECT c."campaignId", COUNT(DISTINCT c."leadId") as qualified_count
        FROM "Call" c
        JOIN "CallAnalysis" ca ON ca."callId" = c.id
        WHERE c."tenantId" = ${tenantId}
          AND c."createdAt" >= ${dateFrom} AND c."createdAt" <= ${dateTo}
          AND ca.disposition IN (${Prisma.join(QUALIFYING_DISPOSITIONS)})
        GROUP BY c."campaignId"
      ) qual ON qual."campaignId" = cmp.id
      LEFT JOIN (
        SELECT "campaignId", COUNT(*) as call_count
        FROM "Call"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${dateFrom} AND "createdAt" <= ${dateTo}
        GROUP BY "campaignId"
      ) calls ON calls."campaignId" = cmp.id
      LEFT JOIN (
        SELECT "campaignId", COALESCE(SUM("chargedAmount"), 0) as total_spend
        FROM "Call"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${dateFrom} AND "createdAt" <= ${dateTo}
        GROUP BY "campaignId"
      ) spend ON spend."campaignId" = cmp.id
      WHERE cmp."tenantId" = ${tenantId}
        AND cmp."createdAt" >= ${dateFrom}
        AND cmp."createdAt" <= ${dateTo}
        ${campaignId ? Prisma.sql`AND cmp.id = ${campaignId}` : Prisma.empty}
      ORDER BY ${orderByClause}
      LIMIT ${limit}
    `;

    return {
      metric,
      data: rows.map((r) => ({ id: r.id, name: r.name, value: r.value })),
    };
  }

  // ── Recent Activity ─────────────────────────────────────────────────────

  async getRecentActivity(tenantId: string): Promise<RecentActivityOutput> {
    const [recentCalls, qualifiedAnalyses] = await Promise.all([
      prisma.call.findMany({
        where: { tenantId },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { name: true, phone: true } },
          campaign: { select: { name: true } },
          callAnalysis: {
            select: { disposition: true, leadTemperature: true },
          },
        },
      }),
      prisma.callAnalysis.findMany({
        where: {
          tenantId,
          disposition: { in: QUALIFYING_DISPOSITIONS },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          call: {
            select: {
              leadId: true,
              lead: { select: { name: true, phone: true } },
              campaign: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      recentCalls: recentCalls.map((c) => ({
        id: c.id,
        bolnaCallId: c.bolnaCallId,
        status: c.status,
        duration: c.duration,
        chargedAmountPaisa: c.chargedAmount,
        startedAt: c.startedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        lead: c.lead,
        campaign: c.campaign,
        callAnalysis: c.callAnalysis
          ? {
              disposition: c.callAnalysis.disposition,
              leadTemperature: c.callAnalysis.leadTemperature,
            }
          : null,
      })),
      qualifiedLeads: qualifiedAnalyses.map((qa) => ({
        leadId: qa.call.leadId,
        name: qa.call.lead.name,
        phone: qa.call.lead.phone,
        campaign: qa.call.campaign.name,
        disposition: qa.disposition,
        leadTemperature: qa.leadTemperature,
        qualifiedAt: qa.createdAt.toISOString(),
      })),
    };
  }
}
