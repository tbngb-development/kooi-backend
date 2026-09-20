import {
  type CallRepository,
  type PaginatedCallsResult,
} from "../interfaces/call-repository.interface";
import { type ListCallsInput } from "../dto/call.dto";

export class ListCallsUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(input: ListCallsInput): Promise<PaginatedCallsResult> { 
    return this.callRepo.list(input.tenantId, {
      campaignId: input.campaignId,
      leadId: input.leadId,
      status: input.status,
      disposition: input.disposition,
      leadTemperature: input.leadTemperature,
      locationMatch: input.locationMatch,
      search: input.search,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      page: input.page,
      limit: input.limit,
      dynamicFilters: input.dynamicFilters,
      metricKey: input.metricKey,
      metricValue: input.metricValue,
    });
  }
}
