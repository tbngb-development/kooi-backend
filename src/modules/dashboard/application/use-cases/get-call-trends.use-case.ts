import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type { CallTrendsOutput, TimeSeriesFilters } from "../dto/dashboard.dto";

export class GetCallTrendsUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: TimeSeriesFilters,
  ): Promise<CallTrendsOutput> {
    return this.repo.getCallTrends(tenantId, filters);
  }
}
