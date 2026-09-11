import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type { TimeSeriesFilters } from "../dto/dashboard.dto";
import { serializeCsv } from "../../domain/rules/csv-serializer";

export class ExportCallTrendsUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  async execute(tenantId: string, filters: TimeSeriesFilters): Promise<string> {
    const result = await this.repo.getCallTrends(tenantId, filters);

    const headers = ["Date", "Total", "Completed", "Failed", "No Answer"];

    const rows = result.data.map((b) => [
      b.date,
      b.total,
      b.completed,
      b.failed,
      b.noAnswer,
    ]);

    return serializeCsv(headers, rows);
  }
}
