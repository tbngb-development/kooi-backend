import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type { LeadFunnelOutput, DashboardFilters } from "../dto/dashboard.dto";

export class GetLeadFunnelUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<LeadFunnelOutput> {
    return this.repo.getLeadFunnel(tenantId, filters);
  }
}
