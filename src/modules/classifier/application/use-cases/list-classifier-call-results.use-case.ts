import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";
import type { ClassifierResultFilters } from "../dto/classifier.dto";
import type { ClassifierExtractionStatus } from "@prisma/client";

export class ListClassifierCallResultsUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(filters: ClassifierResultFilters) {
    return this.repo.listCallResults({
      tenantId: filters.tenantId,
      campaignId: filters.campaignId,
      batchId: filters.batchId,
      status: filters.status as ClassifierExtractionStatus | undefined,
      page: filters.page ?? 1,
      limit: filters.limit ?? 20,
    });
  }
}