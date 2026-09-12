import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type {
  TopCampaignsOutput,
  TopCampaignMetric,
  DashboardFilters,
} from "../dto/dashboard.dto";

export class GetTopCampaignsUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: DashboardFilters,
    metric: TopCampaignMetric,
    limit: number,
  ): Promise<TopCampaignsOutput> {
    return this.repo.getTopCampaigns(tenantId, filters, metric, limit);
  }
}
