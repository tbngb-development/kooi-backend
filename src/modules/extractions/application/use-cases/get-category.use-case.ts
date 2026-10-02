import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { CategoryWithRelations } from "../interfaces/extraction-repository.interface";
import { ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";

export class GetCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(id: string): Promise<CategoryWithRelations> {
    const category = await this.repository.findCategoryByIdWithRelations(id);
    if (!category) {
      throw new ExtractionCategoryNotFoundError(id);
    }
    return category;
  }
}
