import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import { ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";

export class DetachIndustryFromCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(categoryId: string, industryPackId: string): Promise<void> {
    const existing = await this.repository.findCategoryById(categoryId);
    if (!existing) {
      throw new ExtractionCategoryNotFoundError(categoryId);
    }

    await this.repository.detachIndustryFromCategory(
      categoryId,
      industryPackId,
    );
  }
}
