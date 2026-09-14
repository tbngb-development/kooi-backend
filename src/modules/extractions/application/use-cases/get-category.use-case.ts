import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import { ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";

export class GetCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(id: string) {
    const category = await this.repository.findCategoryById(id);
    if (!category) throw new ExtractionCategoryNotFoundError(id);
    return category;
  }
}