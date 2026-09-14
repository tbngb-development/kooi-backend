import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import type { UpdateCategoryDTO } from "../dto/extraction.dto";
import { ExtractionCategoryNotFoundError, DuplicateExtractionSlugError } from "../../domain/errors/extraction.errors";

export class UpdateCategoryUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(id: string, dto: UpdateCategoryDTO) {
    const existing = await this.repository.findCategoryById(id);
    if (!existing) throw new ExtractionCategoryNotFoundError(id);

    if (dto.slug && dto.slug !== existing.slug) {
      const collision = await this.repository.findCategoryBySlug(dto.slug);
      if (collision) throw new DuplicateExtractionSlugError(dto.slug);
    }

    // Push name/model changes to Bolna if synced
    if (existing.bolnaId && (dto.name || dto.model)) {
      await this.bolnaProvider.updateCategory(existing.bolnaId, {
        ...(dto.name && { name: dto.name }),
        ...(dto.model && { model: dto.model }),
      });
    }

    return this.repository.updateCategory(id, dto);
  }
}