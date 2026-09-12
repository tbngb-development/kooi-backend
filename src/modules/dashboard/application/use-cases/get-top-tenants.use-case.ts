import type { AdminDashboardRepository } from "../interfaces/admin-dashboard-repository.interface";
import type {
  TopTenantsOutput,
  TopTenantMetric,
  AdminDashboardFilters,
} from "../dto/dashboard.dto";

export class GetTopTenantsUseCase {
  constructor(private readonly repo: AdminDashboardRepository) {}

  execute(
    filters: AdminDashboardFilters,
    metric: TopTenantMetric,
    limit: number,
  ): Promise<TopTenantsOutput> {
    return this.repo.getTopTenants(filters, metric, limit);
  }
}
