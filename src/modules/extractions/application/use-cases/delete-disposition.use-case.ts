import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import {
  ExtractionDispositionNotFoundError,
  ExtractionDispositionAttachedToAgentError,
} from "../../domain/errors/extraction.errors";

export class DeleteDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(id: string): Promise<void> {
    // 1. Verify exists
    const existing = await this.repository.findDispositionById(id);
    if (!existing) {
      throw new ExtractionDispositionNotFoundError(id);
    }

    // 2. Guard: cannot delete if attached to any platform agent
    const isAttached = await this.repository.isDispositionAttachedToAgent(id);
    if (isAttached) {
      throw new ExtractionDispositionAttachedToAgentError(id);
    }

    // 3. Delete (cascade removes M2M junction rows)
    await this.repository.deleteDisposition(id);
  }
}
