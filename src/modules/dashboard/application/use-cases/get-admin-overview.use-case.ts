import type { AdminDashboardRepository } from "../interfaces/admin-dashboard-repository.interface";
import type {
  PlatformOverviewOutput,
  AdminDashboardFilters,
} from "../dto/dashboard.dto";

export class GetAdminOverviewUseCase {
  constructor(private readonly repo: AdminDashboardRepository) {}

  execute(filters: AdminDashboardFilters): Promise<PlatformOverviewOutput> {
    return this.repo.getOverview(filters);
  }
}
