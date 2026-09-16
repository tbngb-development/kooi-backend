import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import {
  ExtractionCategoryNotFoundError,
  ExtractionCategoryAttachedToAgentError,
} from "../../domain/errors/extraction.errors";

export class DeleteCategoryUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(id: string): Promise<void> {
    // 1. Verify exists
    const existing = await this.repository.findCategoryById(id);
    if (!existing) {
      throw new ExtractionCategoryNotFoundError(id);
    }

    // 2. Guard: cannot delete if attached to any platform agent
    const isAttached = await this.repository.isCategoryAttachedToAgent(id);
    if (isAttached) {
      throw new ExtractionCategoryAttachedToAgentError(id);
    }

    // 3. Delete (cascade removes M2M junction rows)
    await this.repository.deleteCategory(id);
  }
}
