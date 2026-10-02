import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { AttachDispositionsDTO } from "../dto/extraction.dto";
import { ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";

export class AttachDispositionsToCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(categoryId: string, dto: AttachDispositionsDTO): Promise<void> {
    const existing = await this.repository.findCategoryById(categoryId);
    if (!existing) {
      throw new ExtractionCategoryNotFoundError(categoryId);
    }

    await this.repository.attachDispositionsToCategory(
      categoryId,
      dto.dispositionIds,
    );
  }
}
