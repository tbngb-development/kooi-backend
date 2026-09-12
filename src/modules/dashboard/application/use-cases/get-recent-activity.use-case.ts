import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type { RecentActivityOutput } from "../dto/dashboard.dto";

export class GetRecentActivityUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(tenantId: string): Promise<RecentActivityOutput> {
    return this.repo.getRecentActivity(tenantId);
  }
}
