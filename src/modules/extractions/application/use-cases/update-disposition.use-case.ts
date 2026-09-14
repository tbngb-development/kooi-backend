import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import type { UpdateDispositionDTO } from "../dto/extraction.dto";
import { ExtractionDispositionNotFoundError, DuplicateExtractionSlugError } from "../../domain/errors/extraction.errors";

export class UpdateDispositionUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(id: string, dto: UpdateDispositionDTO) {
    const existing = await this.repository.findDispositionById(id);
    if (!existing) throw new ExtractionDispositionNotFoundError(id);

    if (dto.slug && dto.slug !== existing.slug) {
      const collision = await this.repository.findDispositionBySlug(dto.slug);
      if (collision) throw new DuplicateExtractionSlugError(dto.slug);
    }

    if (existing.bolnaId) {
      await this.bolnaProvider.updateDisposition(existing.bolnaId, {
        ...(dto.name && { name: dto.name }),
        ...(dto.question && { question: dto.question }),
        ...(dto.systemPrompt !== undefined && { system_prompt: dto.systemPrompt }),
        ...(dto.isSubjective !== undefined && { is_subjective: dto.isSubjective }),
        ...(dto.isObjective !== undefined && { is_objective: dto.isObjective }),
        ...(dto.subjectiveType && { subjective_type: dto.subjectiveType }),
        ...(dto.objectiveOptions !== undefined && { objective_options: dto.objectiveOptions as any }),
      });
    }

    return this.repository.updateDisposition(id, dto);
  }
}