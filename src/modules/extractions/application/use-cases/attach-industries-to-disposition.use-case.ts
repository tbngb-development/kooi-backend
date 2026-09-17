import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { AttachIndustriesDTO } from "../dto/extraction.dto";
import { ExtractionDispositionNotFoundError } from "../../domain/errors/extraction.errors";

export class AttachIndustriesToDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(
    dispositionId: string,
    dto: AttachIndustriesDTO,
  ): Promise<void> {
    const existing = await this.repository.findDispositionById(dispositionId);
    if (!existing) {
      throw new ExtractionDispositionNotFoundError(dispositionId);
    }

    await this.repository.attachIndustriesToDisposition(
      dispositionId,
      dto.industryPackIds,
    );
  }
}
