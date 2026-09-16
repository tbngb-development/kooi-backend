import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { DispositionWithRelations } from "../interfaces/extraction-repository.interface";
import { ExtractionDispositionNotFoundError } from "../../domain/errors/extraction.errors";

export class GetDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(id: string): Promise<DispositionWithRelations> {
    const disposition =
      await this.repository.findDispositionByIdWithRelations(id);
    if (!disposition) {
      throw new ExtractionDispositionNotFoundError(id);
    }
    return disposition;
  }
}