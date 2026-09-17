import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { CreateCategoryDTO } from "../dto/extraction.dto";
import type { ExtractionCategory } from "@prisma/client";
import {
  DuplicateExtractionCategoryNameError,
  DuplicateExtractionCategorySlugError,
} from "../../domain/errors/extraction.errors";
import { generateSlug } from "../../domain/rules/slug-generator";

export class CreateCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(dto: CreateCategoryDTO): Promise<ExtractionCategory> {
    // 1. Check case-insensitive name uniqueness
    const existingByName = await this.repository.findCategoryByNameInsensitive(
      dto.name,
    );
    if (existingByName) {
      throw new DuplicateExtractionCategoryNameError(dto.name);
    }

    // 2. Check slug uniqueness (edge case: different names → same slug)
    const slug = generateSlug(dto.name);
    const existingBySlug = await this.repository.findCategoryBySlug(slug);
    if (existingBySlug) {
      throw new DuplicateExtractionCategorySlugError(slug);
    }

    // 3. Create with optional M2M relations
    return this.repository.createCategory(dto);
  }
}
