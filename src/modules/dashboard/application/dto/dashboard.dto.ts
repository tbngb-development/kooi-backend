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
  wallet: {
    cashBalancePaisa: number;
    bonusBalancePaisa: number;
    totalBalancePaisa: number;
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
    connectRate: number;
  };
  spend: {
    totalPaisa: number;
    avgCostPerQualifiedLeadPaisa: number;
  };
  projections: {
    dailyBurnRatePaisa: number;
    estimatedDaysRemaining: number | null;
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

// ── Campaign Performance ────────────────────────────────────────────────────

export interface CampaignPerformanceRow {
  id: string;
  name: string;
  status: string;
  assistantName: string;
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  failedLeads: number;
  qualifiedLeads: number;
  completionRate: number;
  qualificationRate: number;
  totalSpendPaisa: number;
  avgCostPerLeadPaisa: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CampaignPerformanceOutput {
  total: number;
  data: CampaignPerformanceRow[];
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
