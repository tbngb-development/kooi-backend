import {
  type LeadRepository,
  type PaginatedLeadsResult,
} from "../interfaces/lead-repository.interface";
import { type ListLeadsInput } from "../dto/lead.dto";

export class ListLeadsUseCase {
  constructor(private readonly leadRepo: LeadRepository) {}

  async execute(input: ListLeadsInput): Promise<PaginatedLeadsResult> {
    return this.leadRepo.list(input.tenantId, {
      campaignId: input.campaignId,
      status: input.status,
      search: input.search,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      page: input.page,
      limit: input.limit,
    });
  }
}
