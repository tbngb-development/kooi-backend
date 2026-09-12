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
} from "../dto/dashboard.dto";

export interface AdminDashboardRepository {
  getOverview(filters: AdminDashboardFilters): Promise<PlatformOverviewOutput>;

  getRevenueTrends(
    filters: AdminTimeSeriesFilters,
  ): Promise<RevenueTrendsOutput>;

  getCallVolumeTrends(
    filters: AdminTimeSeriesFilters,
  ): Promise<PlatformCallVolumeTrendsOutput>;

  getTenantDistribution(): Promise<TenantDistributionOutput>;

  getTopTenants(
    filters: AdminDashboardFilters,
    metric: TopTenantMetric,
    limit: number,
  ): Promise<TopTenantsOutput>;

  getTenantEngagement(
    filters: AdminDashboardFilters,
  ): Promise<TenantEngagementOutput>;

  getAtRiskTenants(): Promise<AtRiskTenantsOutput>;

  getRecentActivity(limit: number): Promise<PlatformActivityOutput>;
}
