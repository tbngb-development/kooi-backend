import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { ListCategoriesFilters } from "../dto/extraction.dto";

export class ListCategoriesUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(filters: ListCategoriesFilters) {
    return this.repository.listCategories(filters);
  }
}