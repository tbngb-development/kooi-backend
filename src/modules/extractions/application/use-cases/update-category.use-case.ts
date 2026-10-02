import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { UpdateCategoryDTO } from "../dto/extraction.dto";
import type { ExtractionCategory } from "@prisma/client";
import {
  ExtractionCategoryNotFoundError,
  DuplicateExtractionCategoryNameError,
  DuplicateExtractionCategorySlugError,
} from "../../domain/errors/extraction.errors";
import { generateSlug } from "../../domain/rules/slug-generator";

export class UpdateCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(
    id: string,
    dto: UpdateCategoryDTO,
  ): Promise<ExtractionCategory> {
    // 1. Verify exists
    const existing = await this.repository.findCategoryById(id);
    if (!existing) {
      throw new ExtractionCategoryNotFoundError(id);
    }

    // 2. If name is changing, check uniqueness (exclude self)
    if (dto.name !== undefined && dto.name.trim() !== existing.name) {
      const duplicate = await this.repository.findCategoryByNameInsensitive(
        dto.name,
      );
      if (duplicate && duplicate.id !== id) {
        throw new DuplicateExtractionCategoryNameError(dto.name);
      }

      const newSlug = generateSlug(dto.name);
      const slugDuplicate = await this.repository.findCategoryBySlug(newSlug);
      if (slugDuplicate && slugDuplicate.id !== id) {
        throw new DuplicateExtractionCategorySlugError(newSlug);
      }
    }

    // 3. Update
    return this.repository.updateCategory(id, dto);
  }
}
