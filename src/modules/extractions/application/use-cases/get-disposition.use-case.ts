import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import { ExtractionDispositionNotFoundError } from "../../domain/errors/extraction.errors";

export class GetDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(id: string) {
    const disposition = await this.repository.findDispositionById(id);
    if (!disposition) throw new ExtractionDispositionNotFoundError(id);
    return disposition;
  }
}