import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import type { CreateCategoryDTO } from "../dto/extraction.dto";
import { DuplicateExtractionSlugError } from "../../domain/errors/extraction.errors";
import prisma from "../../../../shared/config/database/prisma";

export class CreateCategoryUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(dto: CreateCategoryDTO) {
    const existing = await this.repository.findCategoryBySlug(dto.slug);
    if (existing) throw new DuplicateExtractionSlugError(dto.slug);

    // If linked to a PlatformAgent, push to Bolna first
    let bolnaId: string | null = null;
    if (dto.platformAgentId) {
      const agent = await prisma.platformAgent.findUnique({
        where: { id: dto.platformAgentId },
      });
      if (agent?.bolnaId) {
        const bolnaCategory = await this.bolnaProvider.createCategory(agent.bolnaId, {
          name: dto.name,
          model: dto.model ?? "gpt-4.1-mini",
        });
        bolnaId = bolnaCategory.id;
      }
    }

    const category = await this.repository.createCategory(dto);

    if (bolnaId) {
      return this.repository.updateCategory(category.id, { } as any).then(() =>
        prisma.extractionCategory.update({
          where: { id: category.id },
          data: { bolnaId },
        }),
      );
    }

    return category;
  }
}