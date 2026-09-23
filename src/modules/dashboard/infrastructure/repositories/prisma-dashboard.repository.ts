import prisma from "../../../../shared/config/database/prisma";
import { Prisma } from "@prisma/client";
import type { DashboardRepository } from "../../application/interfaces/dashboard-repository.interface";
import type {
  TenantOverviewOutput,
  CallTrendsOutput,
  SpendTrendsOutput,
  LeadFunnelOutput,
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
      },
      calls: {
        total: totalCalls,
        completed: completedCalls,
        failed: failedCalls,
        noAnswer: noAnswerCalls,
      },
      spend: {
        totalPaisa: totalSpend,
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

    const [totalLeads, calledLeadIds, completedLeadIds] = await Promise.all([
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
    ]);

    const called = calledLeadIds.size;
    const completed = completedLeadIds.size;

    return {
      totalLeads,
      calledLeads: called,
      completedLeads: completed,
      rates: {
        callRate: safeRate(called, totalLeads),
        completionRate: safeRate(completed, called),
      },
    };
  }
}
