import type { AdminDashboardRepository } from "../interfaces/admin-dashboard-repository.interface";
import type {
  RevenueTrendsOutput,
  AdminTimeSeriesFilters,
} from "../dto/dashboard.dto";

export class GetRevenueTrendsUseCase {
  constructor(private readonly repo: AdminDashboardRepository) {}

  execute(filters: AdminTimeSeriesFilters): Promise<RevenueTrendsOutput> {
    return this.repo.getRevenueTrends(filters);
  }
}
