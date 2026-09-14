import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import { ExtractionDispositionNotFoundError } from "../../domain/errors/extraction.errors";

export class DeleteDispositionUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(id: string) {
    const existing = await this.repository.findDispositionById(id);
    if (!existing) throw new ExtractionDispositionNotFoundError(id);

    if (existing.bolnaId) {
      await this.bolnaProvider.deleteDisposition(existing.bolnaId);
    }

    await this.repository.deleteDisposition(id);
  }
}