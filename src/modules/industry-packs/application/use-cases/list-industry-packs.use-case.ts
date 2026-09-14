import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import type { ListIndustryPacksFilters } from "../dto/industry-pack.dto";

export class ListIndustryPacksUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(filters: ListIndustryPacksFilters) {
    return this.repository.list(filters);
  }
}