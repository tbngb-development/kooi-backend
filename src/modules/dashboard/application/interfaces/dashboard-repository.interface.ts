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
} from "../dto/dashboard.dto";

export interface DashboardRepository {
  getOverview(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<TenantOverviewOutput>;

  getCallTrends(
    tenantId: string,
    filters: TimeSeriesFilters,
  ): Promise<CallTrendsOutput>;

  getSpendTrends(
    tenantId: string,
    filters: TimeSeriesFilters,
  ): Promise<SpendTrendsOutput>;

  getLeadFunnel(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<LeadFunnelOutput>;

  getDispositionBreakdown(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DispositionBreakdownOutput>;

  getTemperatureDistribution(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<TemperatureDistributionOutput>;

  getTopCampaigns(
    tenantId: string,
    filters: DashboardFilters,
    metric: TopCampaignMetric,
    limit: number,
  ): Promise<TopCampaignsOutput>;

  getRecentActivity(tenantId: string): Promise<RecentActivityOutput>;
}
