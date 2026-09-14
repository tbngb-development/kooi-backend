import { Industry } from "@prisma/client";
import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import {
  DuplicatePlatformAgentBolnaIdError,
  DuplicatePlatformAgentSlugError,
} from "../../domain/errors/platform-agent.errors";
import prisma from "../../../../shared/config/database/prisma";

export interface ImportFromBolnaDTO {
  bolnaId: string;
  slug?: string;
  name?: string;
  industryPackId?: string;
  industry?: Industry;
  category?: string;
  description?: string;
  isFeatured?: boolean;
  sortOrder?: number;
  includeExtractions?: boolean;
}

export class ImportFromBolnaUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
    private readonly templateProvider: BolnaTemplateProvider,
  ) {}

  async execute(dto: ImportFromBolnaDTO) {
    // 1. Check duplicate
    const existing = await this.agentRepository.findByBolnaId(dto.bolnaId);
    if (existing) throw new DuplicatePlatformAgentBolnaIdError(dto.bolnaId);

    // 2. Fetch blueprint from Bolna
    const template = await this.templateProvider.fetchTemplate(dto.bolnaId);

    // 3. Auto-generate slug if not provided
    const slug =
      dto.slug ??
      template.agentName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 55) + `-${dto.bolnaId.slice(0, 4)}`;

    const slugCollision = await this.agentRepository.findBySlug(slug);
    if (slugCollision) throw new DuplicatePlatformAgentSlugError(slug);

    // 4. Create PlatformAgent
    const platformAgent = await this.agentRepository.create({
      bolnaId: dto.bolnaId,
      slug,
      name: dto.name ?? template.agentName,
      industryPackId: dto.industryPackId,
      industry: dto.industry,
      category: dto.category,
      description: dto.description,
      isFeatured: dto.isFeatured,
      sortOrder: dto.sortOrder,
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });

    // 5. Resolve target industry for extractions
    let targetIndustry: Industry = Industry.GENERIC;

    if (dto.industryPackId) {
      const pack = await prisma.industryPack.findUnique({
        where: { id: dto.industryPackId },
      });
      if (pack) targetIndustry = pack.industry;
    } else if (dto.industry) {
      targetIndustry = dto.industry;
    }

    // 6. Auto-sync extractions if requested (default: true)
    const extractionSync = { categories: 0, dispositions: 0 };
    if (dto.includeExtractions !== false) {
      try {
        const categoryData = await this.templateProvider.listCategories(
          dto.bolnaId,
        );
        const categories = categoryData.categories ?? [];

        for (const cat of categories) {
          const catSlug = `bolna-${cat.id.slice(0, 8)}-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

          const upsertedCat =
            await this.extractionRepository.upsertCategoryByBolnaId({
              bolnaId: cat.id,
              slug: catSlug,
              name: cat.name,
              model: cat.model,
              platformAgentId: platformAgent.id,
              industry: targetIndustry,
            });
          extractionSync.categories++;

          for (const disp of cat.dispositions ?? []) {
            const dispSlug = `bolna-${disp.id.slice(0, 8)}-${disp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            await this.extractionRepository.upsertDispositionByBolnaId({
              bolnaId: disp.id,
              slug: dispSlug,
              name: disp.name,
              question: disp.question,
              systemPrompt: disp.system_prompt,
              model: disp.model,
              isSubjective: disp.is_subjective,
              isObjective: disp.is_objective,
              subjectiveType: disp.subjective_type,
              subjectiveTypeConfig: disp.subjective_type_config,
              objectiveOptions: disp.objective_options,
              categoryId: upsertedCat.id,
              industry: targetIndustry,
            });
            extractionSync.dispositions++;
          }
        }
      } catch {
        // Extraction sync is best-effort; agent import succeeds regardless
      }
    }

    return {
      platformAgent,
      extractionSync,
    };
  }
}
