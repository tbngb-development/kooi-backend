import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type { TemperatureDistributionOutput, DashboardFilters } from "../dto/dashboard.dto";

export class GetTemperatureDistributionUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<TemperatureDistributionOutput> {
    return this.repo.getTemperatureDistribution(tenantId, filters);
  }
}