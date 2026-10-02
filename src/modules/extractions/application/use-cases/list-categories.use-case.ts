import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { ListCategoriesFilters } from "../dto/extraction.dto";
import type { CategoryWithCount } from "../interfaces/extraction-repository.interface";

export class ListCategoriesUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(filters: ListCategoriesFilters): Promise<CategoryWithCount[]> {
    return this.repository.listCategories(filters);
  }
}