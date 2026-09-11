import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type {
  CampaignPerformanceOutput,
  DashboardFilters,
} from "../dto/dashboard.dto";

export class GetCampaignPerformanceUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<CampaignPerformanceOutput> {
    return this.repo.getCampaignPerformance(tenantId, filters);
  }
}
