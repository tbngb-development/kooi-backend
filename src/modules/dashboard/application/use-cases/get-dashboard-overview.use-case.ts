import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type {
  TenantOverviewOutput,
  DashboardFilters,
} from "../dto/dashboard.dto";

export class GetDashboardOverviewUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<TenantOverviewOutput> {
    return this.repo.getOverview(tenantId, filters);
  }
}
