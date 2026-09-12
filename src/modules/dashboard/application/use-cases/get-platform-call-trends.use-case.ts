import type { AdminDashboardRepository } from "../interfaces/admin-dashboard-repository.interface";
import type {
  PlatformCallVolumeTrendsOutput,
  AdminTimeSeriesFilters,
} from "../dto/dashboard.dto";

export class GetPlatformCallTrendsUseCase {
  constructor(private readonly repo: AdminDashboardRepository) {}

  execute(
    filters: AdminTimeSeriesFilters,
  ): Promise<PlatformCallVolumeTrendsOutput> {
    return this.repo.getCallVolumeTrends(filters);
  }
}
