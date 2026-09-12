import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type {
  SpendTrendsOutput,
  TimeSeriesFilters,
} from "../dto/dashboard.dto";

export class GetSpendTrendsUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: TimeSeriesFilters,
  ): Promise<SpendTrendsOutput> {
    return this.repo.getSpendTrends(tenantId, filters);
  }
}
