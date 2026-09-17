import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { CreateDispositionDTO } from "../dto/extraction.dto";
import type { ExtractionDisposition } from "@prisma/client";
import {
  DuplicateExtractionDispositionNameError,
  DuplicateExtractionDispositionSlugError,
} from "../../domain/errors/extraction.errors";
import { generateSlug } from "../../domain/rules/slug-generator";

export class CreateDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(dto: CreateDispositionDTO): Promise<ExtractionDisposition> {
    // 1. Check case-insensitive name uniqueness
    const existingByName =
      await this.repository.findDispositionByNameInsensitive(dto.name);
    if (existingByName) {
      throw new DuplicateExtractionDispositionNameError(dto.name);
    }

    // 2. Check slug uniqueness
    const slug = generateSlug(dto.name);
    const existingBySlug = await this.repository.findDispositionBySlug(slug);
    if (existingBySlug) {
      throw new DuplicateExtractionDispositionSlugError(slug);
    }

    // 3. Create with optional M2M relations
    return this.repository.createDisposition(dto);
  }
}
