import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { UpdateDispositionDTO } from "../dto/extraction.dto";
import type { ExtractionDisposition } from "@prisma/client";
import {
  ExtractionDispositionNotFoundError,
  DuplicateExtractionDispositionNameError,
  DuplicateExtractionDispositionSlugError,
  InvalidExtractionConfigurationError, // ← Imported
} from "../../domain/errors/extraction.errors";
import { generateSlug } from "../../domain/rules/slug-generator";

export class UpdateDispositionUseCase {
  constructor(private readonly repository: ExtractionRepository) {}

  async execute(
    id: string,
    dto: UpdateDispositionDTO,
  ): Promise<ExtractionDisposition> {
    // 1. Verify exists
    const existing = await this.repository.findDispositionById(id);
    if (!existing) {
      throw new ExtractionDispositionNotFoundError(id);
    }

    // 2. If name is changing, check uniqueness (exclude self)
    if (dto.name !== undefined && dto.name.trim() !== existing.name) {
      const duplicate = await this.repository.findDispositionByNameInsensitive(
        dto.name,
      );
      if (duplicate && duplicate.id !== id) {
        throw new DuplicateExtractionDispositionNameError(dto.name);
      }

      const newSlug = generateSlug(dto.name);
      const slugDuplicate =
        await this.repository.findDispositionBySlug(newSlug);
      if (slugDuplicate && slugDuplicate.id !== id) {
        throw new DuplicateExtractionDispositionSlugError(newSlug);
      }
    }

    // 3. Compute resulting rule states
    const nextIsObjective =
      dto.isObjective !== undefined ? dto.isObjective : existing.isObjective;
    const nextIsSubjective =
      dto.isSubjective !== undefined ? dto.isSubjective : existing.isSubjective;

    // Automatic update cascade: force flag false if root extraction method is disabled
    let finalShowInOverview =
      dto.showInOverview !== undefined
        ? dto.showInOverview
        : existing.showInOverview;
    if (!nextIsObjective) {
      finalShowInOverview = false;
    }

    let finalShowInInsights =
      dto.showInInsights !== undefined
        ? dto.showInInsights
        : existing.showInInsights;
    if (!nextIsSubjective) {
      finalShowInInsights = false;
    }

    // Explicit payload validation assertions
    if (finalShowInOverview && !nextIsObjective) {
      throw new InvalidExtractionConfigurationError(
        "showInOverview can only be true if isObjective is true",
      );
    }

    if (finalShowInInsights && !nextIsSubjective) {
      throw new InvalidExtractionConfigurationError(
        "showInInsights can only be true if isSubjective is true",
      );
    }

    // Align request payload values with computed outcomes
    dto.showInOverview = finalShowInOverview;
    dto.showInInsights = finalShowInInsights;

    // 4. Update
    return this.repository.updateDisposition(id, dto);
  }
}
