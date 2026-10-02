import prisma from "../../../../shared/config/database/prisma";
import { Prisma } from "@prisma/client";
import type { AdminDashboardRepository } from "../../application/interfaces/admin-dashboard-repository.interface";
import type {
  PlatformOverviewOutput,
  RevenueTrendsOutput,
  PlatformCallVolumeTrendsOutput,
  TenantDistributionOutput,
  TopTenantsOutput,
  TopTenantMetric,
  TenantEngagementOutput,
  AtRiskTenantsOutput,
  PlatformActivityOutput,
  AdminDashboardFilters,
  AdminTimeSeriesFilters,
  EngagementLevel,
  RiskReason,
} from "../../application/dto/dashboard.dto";
import {
  PG_GRANULARITY,
  generateDateBuckets,
  toDateString,
} from "../../domain/rules/date-range.rules";

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeRate(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 10000) / 100;
}

// ── Raw query types ─────────────────────────────────────────────────────────

interface RawDateBucket {
  bucket: string;
  total: number;
  completed: number;
  failed: number;
  no_answer: number;
}

interface RawRevenueBucket {
  bucket: string;
  total_revenue: number;
  recharge_count: number;
}

interface RawPlanDist {
  plan_name: string;
  plan_slug: string;
  tenant_count: number;
}

interface RawTopTenant {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  value: number;
}

interface RawTenantActivity {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  planName: string;
  isActive: boolean;
  lastCallAt: Date | null;
  activeCampaigns: number;
  callsInPeriod: number;
  walletBalance: number;
}

// ── Repository ──────────────────────────────────────────────────────────────

export class PrismaAdminDashboardRepository implements AdminDashboardRepository {
  // ── Overview ────────────────────────────────────────────────────────────
  async getOverview(
    filters: AdminDashboardFilters,
  ): Promise<PlatformOverviewOutput> {
    const { dateFrom, dateTo } = filters;

    const [
      totalTenants,
      activeTenants,
      newTenants,
      totalUsers,
      activeUsers,
      newUsers,
      revenueAgg,
      totalCalls,
      completedCalls,
      failedCalls,
      durationAgg,
      totalCampaigns,
      activeCampaigns,
    ] = await Promise.all([
      // Tenants
      prisma.tenant.count(),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.tenant.count({
        where: { createdAt: { gte: dateFrom, lte: dateTo } },
      }),

      // Users (excluding platform admins)
      prisma.user.count({ where: { platformAdmin: null } }),
      prisma.user.count({ where: { platformAdmin: null, isActive: true } }),
      prisma.user.count({
        where: {
          platformAdmin: null,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
      }),

      // Revenue (completed recharges in range)
      prisma.recharge.aggregate({
        where: {
          status: "SUCCESS",
          completedAt: { gte: dateFrom, lte: dateTo },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Calls in range
      prisma.call.count({
        where: { createdAt: { gte: dateFrom, lte: dateTo } },
      }),
      prisma.call.count({
        where: {
          createdAt: { gte: dateFrom, lte: dateTo },
          status: "COMPLETED",
        },
      }),
      prisma.call.count({
        where: { createdAt: { gte: dateFrom, lte: dateTo }, status: "FAILED" },
      }),
      prisma.call.aggregate({
        where: {
          createdAt: { gte: dateFrom, lte: dateTo },
          status: "COMPLETED",
        },
        _sum: { duration: true },
      }),

      // Campaigns
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "RUNNING" } }),
    ]);

    const totalRevenue = revenueAgg._sum.amount ?? 0;
    const rechargeCount = revenueAgg._count;
    const totalDurationSec = durationAgg._sum.duration ?? 0;

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        newInPeriod: newTenants,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        newInPeriod: newUsers,
      },
      revenue: {
        totalPaisa: totalRevenue,
        avgPerTenantPaisa:
          activeTenants > 0 ? Math.round(totalRevenue / activeTenants) : 0,
        rechargeCount,
      },
      calls: {
        total: totalCalls,
        completed: completedCalls,
        failed: failedCalls,
        totalDurationMinutes: Math.round(totalDurationSec / 60),
      },
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
      },
    };
  }

  // ── Revenue Trends ──────────────────────────────────────────────────────

  async getRevenueTrends(
    filters: AdminTimeSeriesFilters,
  ): Promise<RevenueTrendsOutput> {
    const { dateFrom, dateTo, granularity } = filters;
    const pgGran = PG_GRANULARITY[granularity];

    const rows = await prisma.$queryRaw<RawRevenueBucket[]>`
      SELECT
        date_trunc(${Prisma.raw(`'${pgGran}'`)}, "completedAt")::date as bucket,
        COALESCE(SUM(amount), 0)::int as total_revenue,
        COUNT(*)::int as recharge_count
      FROM "Recharge"
      WHERE status = 'SUCCESS'
        AND "completedAt" IS NOT NULL
        AND "completedAt" >= ${dateFrom}
        AND "completedAt" <= ${dateTo}
      GROUP BY bucket
      ORDER BY bucket
    `;

    // FIX: Normalize bucket key to "YYYY-MM-DD" to match generateDateBuckets output
    const dbMap = new Map(rows.map((r) => [toDateString(r.bucket), r]));
    const buckets = generateDateBuckets(dateFrom, dateTo, granularity);

    const data = buckets.map((date) => {
      const row = dbMap.get(date);
      const revenue = row?.total_revenue ?? 0;
      const count = row?.recharge_count ?? 0;
      return {
        date,
        totalRevenuePaisa: revenue,
        rechargeCount: count,
        avgRechargePaisa: count > 0 ? Math.round(revenue / count) : 0,
      };
    });

    return { granularity, data };
  }

  // ── Call Volume Trends ──────────────────────────────────────────────────

  async getCallVolumeTrends(
    filters: AdminTimeSeriesFilters,
  ): Promise<PlatformCallVolumeTrendsOutput> {
    const { dateFrom, dateTo, granularity } = filters;
    const pgGran = PG_GRANULARITY[granularity];

    const rows = await prisma.$queryRaw<RawDateBucket[]>`
      SELECT
        date_trunc(${Prisma.raw(`'${pgGran}'`)}, "createdAt")::date as bucket,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int as failed,
        COUNT(*) FILTER (WHERE status = 'NO_ANSWER')::int as no_answer
      FROM "Call"
      WHERE "createdAt" >= ${dateFrom}
        AND "createdAt" <= ${dateTo}
      GROUP BY bucket
      ORDER BY bucket
    `;

    // FIX: Normalize bucket key to "YYYY-MM-DD"
    const dbMap = new Map(rows.map((r) => [toDateString(r.bucket), r]));
    const buckets = generateDateBuckets(dateFrom, dateTo, granularity);

    const data = buckets.map((date) => {
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

  // ── Tenant Distribution by Plan ─────────────────────────────────────────

  async getTenantDistribution(): Promise<TenantDistributionOutput> {
    const rows = await prisma.$queryRaw<RawPlanDist[]>`
      SELECT
        p.name as plan_name,
        p.slug as plan_slug,
        COUNT(tp."tenantId")::int as tenant_count
      FROM "TenantPlan" tp
      JOIN "Plan" p ON p.id = tp."planId"
      WHERE tp.status = 'ACTIVE'
      GROUP BY p.id, p.name, p.slug
      ORDER BY tenant_count DESC
    `;

    const total = rows.reduce((s, r) => s + r.tenant_count, 0);

    // Include tenants without an active plan
    const unassignedCount = await prisma.tenant.count({
      where: { tenantPlan: null },
    });

    const allRows = [
      ...rows.map((r) => ({
        planName: r.plan_name,
        planSlug: r.plan_slug,
        tenantCount: r.tenant_count,
        percentage: safeRate(r.tenant_count, total + unassignedCount),
      })),
      ...(unassignedCount > 0
        ? [
            {
              planName: "No Plan",
              planSlug: "none",
              tenantCount: unassignedCount,
              percentage: safeRate(unassignedCount, total + unassignedCount),
            },
          ]
        : []),
    ];

    return { total: total + unassignedCount, data: allRows };
  }

  // ── Top Tenants ─────────────────────────────────────────────────────────

  async getTopTenants(
    filters: AdminDashboardFilters,
    metric: TopTenantMetric,
    limit: number,
  ): Promise<TopTenantsOutput> {
    const { dateFrom, dateTo } = filters;

    let joinClause: Prisma.Sql;
    let valueExpr: Prisma.Sql;

    switch (metric) {
      case "total_spend":
        joinClause = Prisma.sql`
          LEFT JOIN (
            SELECT "tenantId", COALESCE(SUM("chargedAmount"), 0) as val
            FROM "Call"
            WHERE "createdAt" >= ${dateFrom} AND "createdAt" <= ${dateTo}
            GROUP BY "tenantId"
          ) m ON m."tenantId" = t.id
        `;
        valueExpr = Prisma.sql`COALESCE(m.val, 0)::int`;
        break;

      case "call_volume":
        joinClause = Prisma.sql`
          LEFT JOIN (
            SELECT "tenantId", COUNT(*) as val
            FROM "Call"
            WHERE "createdAt" >= ${dateFrom} AND "createdAt" <= ${dateTo}
            GROUP BY "tenantId"
          ) m ON m."tenantId" = t.id
        `;
        valueExpr = Prisma.sql`COALESCE(m.val, 0)::int`;
        break;

      case "revenue":
        joinClause = Prisma.sql`
          LEFT JOIN (
            SELECT "tenantId", COALESCE(SUM(amount), 0) as val
            FROM "Recharge"
            WHERE status = 'SUCCESS'
              AND "completedAt" >= ${dateFrom} AND "completedAt" <= ${dateTo}
            GROUP BY "tenantId"
          ) m ON m."tenantId" = t.id
        `;
        valueExpr = Prisma.sql`COALESCE(m.val, 0)::int`;
        break;
    }

    const rows = await prisma.$queryRaw<RawTopTenant[]>`
      SELECT
        t.id as "tenantId",
        t.name as "tenantName",
        t.email as "tenantEmail",
        ${valueExpr} as value
      FROM "Tenant" t
      ${joinClause}
      WHERE t."isActive" = true
      ORDER BY value DESC
      LIMIT ${limit}
    `;

    return {
      metric,
      data: rows.map((r) => ({
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        tenantEmail: r.tenantEmail,
        value: r.value,
      })),
    };
  }

  // ── Tenant Engagement ───────────────────────────────────────────────────

  async getTenantEngagement(
    filters: AdminDashboardFilters,
  ): Promise<TenantEngagementOutput> {
    const { dateFrom, dateTo } = filters;

    const rows = await prisma.$queryRaw<RawTenantActivity[]>`
      SELECT
        t.id as "tenantId",
        t.name as "tenantName",
        t.email as "tenantEmail",
        COALESCE(p.name, 'No Plan') as "planName",
        t."isActive" as "isActive",
        (
          SELECT MAX(c."createdAt")
          FROM "Call" c
          WHERE c."tenantId" = t.id
        ) as "lastCallAt",
        (
          SELECT COUNT(*)::int
          FROM "Campaign" cmp
          WHERE cmp."tenantId" = t.id AND cmp.status = 'RUNNING'
        ) as "activeCampaigns",
        (
          SELECT COUNT(*)::int
          FROM "Call" c
          WHERE c."tenantId" = t.id
            AND c."createdAt" >= ${dateFrom}
            AND c."createdAt" <= ${dateTo}
        ) as "callsInPeriod",
        COALESCE(w."cashBalance", 0) + COALESCE(w."bonusBalance", 0) as "walletBalance"
      FROM "Tenant" t
      LEFT JOIN "TenantPlan" tp ON tp."tenantId" = t.id
      LEFT JOIN "Plan" p ON p.id = tp."planId"
      LEFT JOIN "Wallet" w ON w."tenantId" = t.id
      WHERE t."isActive" = true
      ORDER BY t."createdAt" DESC
    `;

    const now = new Date();
    let high = 0;
    let medium = 0;
    let low = 0;

    const data = rows.map((r) => {
      const daysSince = r.lastCallAt
        ? Math.floor(
            (now.getTime() - new Date(r.lastCallAt).getTime()) / 86400000,
          )
        : null;

      // Scoring: 0–100
      let score = 0;
      if (daysSince !== null && daysSince <= 7) score += 40;
      else if (daysSince !== null && daysSince <= 30) score += 10;

      if (r.activeCampaigns > 0) score += 30;
      if (r.walletBalance > 0) score += 20;
      if (r.callsInPeriod > 0) score += 10;

      const level: EngagementLevel =
        score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";

      if (level === "HIGH") high++;
      else if (level === "MEDIUM") medium++;
      else low++;

      return {
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        tenantEmail: r.tenantEmail,
        planName: r.planName,
        isActive: r.isActive,
        engagementScore: score,
        engagementLevel: level,
        lastCallAt: r.lastCallAt ? new Date(r.lastCallAt).toISOString() : null,
        daysSinceLastCall: daysSince,
        activeCampaigns: r.activeCampaigns,
        callsInPeriod: r.callsInPeriod,
        walletBalancePaisa: Number(r.walletBalance),
      };
    });

    return {
      total: data.length,
      summary: { high, medium, low },
      data,
    };
  }

  // ── At-Risk Tenants ─────────────────────────────────────────────────────

  async getAtRiskTenants(): Promise<AtRiskTenantsOutput> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    const rows = await prisma.$queryRaw<
      {
        tenantId: string;
        tenantName: string;
        tenantEmail: string;
        planName: string;
        lastCallAt: Date | null;
        activeCampaigns: number;
        walletBalance: number;
        lowBalanceThreshold: number;
      }[]
    >`
      SELECT
        t.id as "tenantId",
        t.name as "tenantName",
        t.email as "tenantEmail",
        COALESCE(p.name, 'No Plan') as "planName",
        (SELECT MAX(c."createdAt") FROM "Call" c WHERE c."tenantId" = t.id) as "lastCallAt",
        (SELECT COUNT(*)::int FROM "Campaign" cmp WHERE cmp."tenantId" = t.id AND cmp.status = 'RUNNING') as "activeCampaigns",
        COALESCE(w."cashBalance", 0) + COALESCE(w."bonusBalance", 0) as "walletBalance",
        COALESCE(pv."lowBalanceThreshold", 10000) as "lowBalanceThreshold"
      FROM "Tenant" t
      LEFT JOIN "TenantPlan" tp ON tp."tenantId" = t.id
      LEFT JOIN "Plan" p ON p.id = tp."planId"
      LEFT JOIN "PlanVersion" pv ON pv.id = tp."planVersionId"
      LEFT JOIN "Wallet" w ON w."tenantId" = t.id
      WHERE t."isActive" = true
    `;

    const now = new Date();
    const atRisk = rows
      .map((r) => {
        const daysSince = r.lastCallAt
          ? Math.floor(
              (now.getTime() - new Date(r.lastCallAt).getTime()) / 86400000,
            )
          : null;

        const reasons: RiskReason[] = [];

        if (daysSince === null || daysSince >= 14) {
          reasons.push("NO_CALLS_14_DAYS");
        }
        if (r.walletBalance < r.lowBalanceThreshold) {
          reasons.push("LOW_WALLET_BALANCE");
        }
        if (r.activeCampaigns === 0) {
          reasons.push("NO_ACTIVE_CAMPAIGNS");
        }

        return {
          tenantId: r.tenantId,
          tenantName: r.tenantName,
          tenantEmail: r.tenantEmail,
          planName: r.planName,
          reasons,
          lastCallAt: r.lastCallAt
            ? new Date(r.lastCallAt).toISOString()
            : null,
          daysSinceLastCall: daysSince,
          walletBalancePaisa: Number(r.walletBalance),
          activeCampaigns: r.activeCampaigns,
        };
      })
      .filter((t) => t.reasons.length > 0);

    return { total: atRisk.length, data: atRisk };
  }

  // ── Recent Activity ─────────────────────────────────────────────────────

  async getRecentActivity(limit: number): Promise<PlatformActivityOutput> {
    const [tenants, campaigns, recharges] = await Promise.all([
      prisma.tenant.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.campaign.findMany({
        take: limit,
        orderBy: { updatedAt: "desc" },
        where: { status: { in: ["RUNNING", "COMPLETED"] } },
        include: { tenant: { select: { id: true, name: true } } },
      }),
      prisma.recharge.findMany({
        take: limit,
        orderBy: { completedAt: "desc" },
        where: { status: "SUCCESS" },
        include: {
          wallet: { include: { tenant: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const entries: PlatformActivityOutput["data"] = [];

    for (const t of tenants) {
      entries.push({
        id: `tenant-${t.id}`,
        tenantId: t.id,
        tenantName: t.name,
        type: "TENANT_REGISTERED",
        message: `New tenant "${t.name}" registered.`,
        timestamp: t.createdAt.toISOString(),
      });
    }

    for (const c of campaigns) {
      entries.push({
        id: `camp-${c.id}-${c.updatedAt.getTime()}`,
        tenantId: c.tenant.id,
        tenantName: c.tenant.name,
        type:
          c.status === "RUNNING" ? "CAMPAIGN_STARTED" : "CAMPAIGN_COMPLETED",
        message: `Campaign "${c.name}" ${c.status === "RUNNING" ? "started" : "completed"}.`,
        timestamp: c.updatedAt.toISOString(),
      });
    }

    for (const r of recharges) {
      entries.push({
        id: `recharge-${r.id}`,
        tenantId: r.wallet.tenant.id,
        tenantName: r.wallet.tenant.name,
        type: "RECHARGE_SUCCESS",
        message: `₹${(r.amount / 100).toFixed(0)} recharge successful for "${r.wallet.tenant.name}".`,
        timestamp: r.completedAt?.toISOString() ?? r.createdAt.toISOString(),
      });
    }

    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return { data: entries.slice(0, limit) };
  }
}
