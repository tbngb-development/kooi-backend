import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { AttachIndustriesDTO } from "../dto/extraction.dto";
import { ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";

export class AttachIndustriesToCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(categoryId: string, dto: AttachIndustriesDTO): Promise<void> {
    const existing = await this.repository.findCategoryById(categoryId);
    if (!existing) {
      throw new ExtractionCategoryNotFoundError(categoryId);
    }

    await this.repository.attachIndustriesToCategory(
      categoryId,
      dto.industryPackIds,
    );
  }
}