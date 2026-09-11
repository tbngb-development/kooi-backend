import type { DashboardRepository } from "../interfaces/dashboard-repository.interface";
import type { DashboardFilters } from "../dto/dashboard.dto";
import { serializeCsv } from "../../domain/rules/csv-serializer";

export class ExportCampaignPerformanceUseCase {
  constructor(private readonly repo: DashboardRepository) {}

  async execute(tenantId: string, filters: DashboardFilters): Promise<string> {
    const result = await this.repo.getCampaignPerformance(tenantId, filters);

    const headers = [
      "Campaign",
      "Status",
      "Assistant",
      "Total Leads",
      "Called",
      "Completed",
      "Failed",
      "Qualified",
      "Completion %",
      "Qualification %",
      "Spend (₹)",
      "Avg Cost/Lead (₹)",
      "Started",
      "Completed",
      "Created",
    ];

    const rows = result.data.map((c) => [
      c.name,
      c.status,
      c.assistantName,
      c.totalLeads,
      c.calledLeads,
      c.completedLeads,
      c.failedLeads,
      c.qualifiedLeads,
      c.completionRate,
      c.qualificationRate,
      (c.totalSpendPaisa / 100).toFixed(2),
      (c.avgCostPerLeadPaisa / 100).toFixed(2),
      c.startedAt ?? "",
      c.completedAt ?? "",
      c.createdAt,
    ]);

    return serializeCsv(headers, rows);
  }
}
