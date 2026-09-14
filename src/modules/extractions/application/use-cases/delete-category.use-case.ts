import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import { ExtractionCategoryNotFoundError, ExtractionCategoryHasDispositionsError } from "../../domain/errors/extraction.errors";

export class DeleteCategoryUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(id: string) {
    const existing = await this.repository.findCategoryById(id);
    if (!existing) throw new ExtractionCategoryNotFoundError(id);

    const count = await this.repository.countDispositionsInCategory(id);
    if (count > 0) throw new ExtractionCategoryHasDispositionsError(count);

    if (existing.bolnaId) {
      await this.bolnaProvider.deleteCategory(existing.bolnaId);
    }

    await this.repository.deleteCategory(id);
  }
}