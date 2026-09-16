import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import { ExtractionDispositionNotFoundError } from "../../domain/errors/extraction.errors";

export class DetachIndustryFromDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(dispositionId: string, industryPackId: string): Promise<void> {
    const existing = await this.repository.findDispositionById(dispositionId);
    if (!existing) {
      throw new ExtractionDispositionNotFoundError(dispositionId);
    }

    await this.repository.detachIndustryFromDisposition(
      dispositionId,
      industryPackId,
    );
  }
}
