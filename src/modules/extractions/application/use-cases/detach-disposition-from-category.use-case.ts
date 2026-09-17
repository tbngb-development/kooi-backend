import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import { ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";

export class DetachDispositionFromCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(
    categoryId: string,
    dispositionId: string,
  ): Promise<void> {
    const existing = await this.repository.findCategoryById(categoryId);
    if (!existing) {
      throw new ExtractionCategoryNotFoundError(categoryId);
    }

    await this.repository.detachDispositionFromCategory(
      categoryId,
      dispositionId,
    );
  }
}