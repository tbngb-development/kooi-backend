import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import type { CreateDispositionDTO } from "../dto/extraction.dto";
import { DuplicateExtractionSlugError, ExtractionCategoryNotFoundError } from "../../domain/errors/extraction.errors";
import prisma from "../../../../shared/config/database/prisma";

export class CreateDispositionUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(dto: CreateDispositionDTO) {
    const existing = await this.repository.findDispositionBySlug(dto.slug);
    if (existing) throw new DuplicateExtractionSlugError(dto.slug);

    const category = await this.repository.findCategoryById(dto.categoryId);
    if (!category) throw new ExtractionCategoryNotFoundError(dto.categoryId);

    // Push to Bolna if category is synced
    let bolnaId: string | null = null;
    if (category.bolnaId && category.platformAgentId) {
      const agent = await prisma.platformAgent.findUnique({
        where: { id: category.platformAgentId },
      });
      if (agent?.bolnaId) {
        const result = await this.bolnaProvider.createDisposition({
          agent_id: agent.bolnaId,
          name: dto.name,
          question: dto.question,
          category_id: category.bolnaId,
          system_prompt: dto.systemPrompt,
          model: dto.model,
          is_subjective: dto.isSubjective,
          is_objective: dto.isObjective,
          subjective_type: dto.subjectiveType,
          subjective_type_config: dto.subjectiveTypeConfig as any,
          objective_options: dto.objectiveOptions as any,
        });
        bolnaId = result.id;
      }
    }

    const disposition = await this.repository.createDisposition(dto);

    if (bolnaId) {
      return prisma.extractionDisposition.update({
        where: { id: disposition.id },
        data: { bolnaId },
      });
    }

    return disposition;
  }
}