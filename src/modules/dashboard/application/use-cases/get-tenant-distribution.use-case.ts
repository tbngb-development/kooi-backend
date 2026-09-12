import type { AdminDashboardRepository } from "../interfaces/admin-dashboard-repository.interface";
import type { TenantDistributionOutput } from "../dto/dashboard.dto";

export class GetTenantDistributionUseCase {
  constructor(private readonly repo: AdminDashboardRepository) {}

  execute(): Promise<TenantDistributionOutput> {
    return this.repo.getTenantDistribution();
  }
}