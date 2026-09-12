import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type {
  DispositionBreakdownOutput,
  DashboardFilters,
} from "../dto/dashboard.dto";

export class GetDispositionBreakdownUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  execute(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DispositionBreakdownOutput> {
    return this.repo.getDispositionBreakdown(tenantId, filters);
  }
}
