import type { Granularity } from "../../domain/rules/date-range.rules";

// ── Common Filters ──────────────────────────────────────────────────────────

export interface DashboardFilters {
  dateFrom: Date;
  dateTo: Date;
  campaignId?: string;
}

export interface TimeSeriesFilters extends DashboardFilters {
  granularity: Granularity;
}

// ── Overview ────────────────────────────────────────────────────────────────

export interface TenantOverviewOutput {
  campaigns: {
    total: number;
    active: number;
  };
  leads: {
    total: number;
    qualified: number;
    notQualified: number;
    qualificationRate: number;
  };
  calls: {
    total: number;
    completed: number;
    failed: number;
    noAnswer: number;
  };
  spend: {
    totalPaisa: number;
    avgCostPerQualifiedLeadPaisa: number;
  };
}

// ── Call Trends ─────────────────────────────────────────────────────────────

export interface CallTrendBucket {
  date: string;
  total: number;
  completed: number;
  failed: number;
  noAnswer: number;
}

export interface CallTrendsOutput {
  granularity: Granularity;
  data: CallTrendBucket[];
}

// ── Spend Trends ────────────────────────────────────────────────────────────

export interface SpendTrendBucket {
  date: string;
  cashSpentPaisa: number;
  bonusSpentPaisa: number;
  totalSpentPaisa: number;
}

export interface SpendTrendsOutput {
  granularity: Granularity;
  data: SpendTrendBucket[];
}

// ── Lead Funnel ─────────────────────────────────────────────────────────────

export interface LeadFunnelOutput {
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  qualifiedLeads: number;
  rates: {
    callRate: number;
    completionRate: number;
    qualificationRate: number;
  };
}

// ── Disposition Breakdown ───────────────────────────────────────────────────

export interface DispositionBucket {
  disposition: string;
  count: number;
  percentage: number;
}

export interface DispositionBreakdownOutput {
  total: number;
  data: DispositionBucket[];
}

// ── Temperature Distribution ────────────────────────────────────────────────

export interface TemperatureBucket {
  temperature: string;
  count: number;
  percentage: number;
}

export interface TemperatureDistributionOutput {
  total: number;
  data: TemperatureBucket[];
}

// ── Top Campaigns ───────────────────────────────────────────────────────────

export type TopCampaignMetric =
  "qualified_leads" | "total_calls" | "total_spend";

export interface TopCampaignRow {
  id: string;
  name: string;
  value: number;
}

export interface TopCampaignsOutput {
  metric: TopCampaignMetric;
  data: TopCampaignRow[];
}

// ── Recent Activity ─────────────────────────────────────────────────────────

export interface RecentCallEntry {
  id: string;
  bolnaCallId: string | null;
  status: string;
  duration: number | null;
  chargedAmountPaisa: number | null;
  startedAt: string | null;
  createdAt: string;
  lead: { name: string | null; phone: string } | null;
  campaign: { name: string } | null;
  callAnalysis: {
    disposition: string | null;
    leadTemperature: string | null;
  } | null;
}

export interface QualifiedLeadEntry {
  leadId: string;
  name: string | null;
  phone: string;
  campaign: string;
  disposition: string | null;
  leadTemperature: string | null;
  qualifiedAt: string;
}

export interface RecentActivityOutput {
  recentCalls: RecentCallEntry[];
  qualifiedLeads: QualifiedLeadEntry[];
}

// ── Admin Filters ───────────────────────────────────────────────────────────

export interface AdminDashboardFilters {
  dateFrom: Date;
  dateTo: Date;
}

export interface AdminTimeSeriesFilters extends AdminDashboardFilters {
  granularity: Granularity;
}

// ── Platform Overview ───────────────────────────────────────────────────────

export interface PlatformOverviewOutput {
  tenants: {
    total: number;
    active: number;
    newInPeriod: number;
  };
  users: {
    total: number;
    active: number;
    newInPeriod: number;
  };
  revenue: {
    totalPaisa: number;
    avgPerTenantPaisa: number;
    rechargeCount: number;
  };
  calls: {
    total: number;
    completed: number;
    failed: number;
    totalDurationMinutes: number;
  };
  campaigns: {
    total: number;
    active: number;
  };
}

// ── Revenue Trends ──────────────────────────────────────────────────────────

export interface RevenueTrendBucket {
  date: string;
  totalRevenuePaisa: number;
  rechargeCount: number;
  avgRechargePaisa: number;
}

export interface RevenueTrendsOutput {
  granularity: Granularity;
  data: RevenueTrendBucket[];
}

// ── Call Volume Trends (Platform-wide) ──────────────────────────────────────

export interface PlatformCallTrendBucket {
  date: string;
  total: number;
  completed: number;
  failed: number;
  noAnswer: number;
}

export interface PlatformCallVolumeTrendsOutput {
  granularity: Granularity;
  data: PlatformCallTrendBucket[];
}

// ── Tenant Distribution by Plan ─────────────────────────────────────────────

export interface PlanDistributionBucket {
  planName: string;
  planSlug: string;
  tenantCount: number;
  percentage: number;
}

export interface TenantDistributionOutput {
  total: number;
  data: PlanDistributionBucket[];
}

// ── Top Tenants ─────────────────────────────────────────────────────────────

export type TopTenantMetric = "total_spend" | "call_volume" | "revenue";

export interface TopTenantRow {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  value: number;
}

export interface TopTenantsOutput {
  metric: TopTenantMetric;
  data: TopTenantRow[];
}

// ── Tenant Engagement (replaces "health") ───────────────────────────────────

export type EngagementLevel = "HIGH" | "MEDIUM" | "LOW";

export interface TenantEngagementRow {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  planName: string;
  isActive: boolean;
  engagementScore: number;
  engagementLevel: EngagementLevel;
  lastCallAt: string | null;
  daysSinceLastCall: number | null;
  activeCampaigns: number;
  callsInPeriod: number;
  walletBalancePaisa: number;
}

export interface TenantEngagementOutput {
  total: number;
  summary: {
    high: number;
    medium: number;
    low: number;
  };
  data: TenantEngagementRow[];
}

// ── At-Risk Tenants ─────────────────────────────────────────────────────────

export type RiskReason =
  "NO_CALLS_14_DAYS" | "LOW_WALLET_BALANCE" | "NO_ACTIVE_CAMPAIGNS";

export interface AtRiskTenantRow {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  planName: string;
  reasons: RiskReason[];
  lastCallAt: string | null;
  daysSinceLastCall: number | null;
  walletBalancePaisa: number;
  activeCampaigns: number;
}

export interface AtRiskTenantsOutput {
  total: number;
  data: AtRiskTenantRow[];
}

// ── Platform Activity ───────────────────────────────────────────────────────

export type PlatformActivityType =
  | "TENANT_REGISTERED"
  | "CAMPAIGN_STARTED"
  | "CAMPAIGN_COMPLETED"
  | "BATCH_COMPLETED"
  | "RECHARGE_SUCCESS"
  | "CALL_MILESTONE";

export interface PlatformActivityEntry {
  id: string;
  tenantId: string;
  tenantName: string;
  type: PlatformActivityType;
  message: string;
  timestamp: string;
}

export interface PlatformActivityOutput {
  data: PlatformActivityEntry[];
}
