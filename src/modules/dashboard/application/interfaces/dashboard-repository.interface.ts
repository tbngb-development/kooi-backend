import type {
  TenantOverviewOutput,
  CallTrendsOutput,
  SpendTrendsOutput,
  LeadFunnelOutput,
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
}
