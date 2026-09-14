import { Industry } from "@prisma/client";
import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import { ExtractionPlatformAgentRequiredError } from "../../domain/errors/extraction.errors";
import prisma from "../../../../shared/config/database/prisma";

export interface ImportExtractionsFromBolnaDTO {
  platformAgentId: string;
  categoryBolnaIds?: string[];
  dispositionBolnaIds?: string[];
}

export class ImportExtractionsFromBolnaUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(dto: ImportExtractionsFromBolnaDTO) {
    const agent = await prisma.platformAgent.findUnique({
      where: { id: dto.platformAgentId },
      include: { industryPack: true },
    });
    if (!agent?.bolnaId) throw new ExtractionPlatformAgentRequiredError();

    const targetIndustry: Industry =
      agent.industryPack?.industry ?? Industry.GENERIC;
    const results = { categories: 0, dispositions: 0 };

    // Import specific categories (with their dispositions)
    if (dto.categoryBolnaIds?.length) {
      const bolnaData = await this.bolnaProvider.listCategories(agent.bolnaId);
      const categories = bolnaData.categories ?? [];

      for (const cat of categories) {
        if (!dto.categoryBolnaIds.includes(cat.id)) continue;

        const catSlug = `bolna-${cat.id.slice(0, 8)}-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const upsertedCat = await this.repository.upsertCategoryByBolnaId({
          bolnaId: cat.id,
          slug: catSlug,
          name: cat.name,
          model: cat.model,
          platformAgentId: dto.platformAgentId,
          industry: targetIndustry,
        });
        results.categories++;

        for (const disp of cat.dispositions ?? []) {
          const dispSlug = `bolna-${disp.id.slice(0, 8)}-${disp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          await this.repository.upsertDispositionByBolnaId({
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
          results.dispositions++;
        }
      }
    }

    // Import specific dispositions (standalone)
    if (dto.dispositionBolnaIds?.length) {
      const allDispositions = await this.bolnaProvider.listDispositions(
        agent.bolnaId,
      );

      for (const disp of allDispositions) {
        if (!dto.dispositionBolnaIds.includes(disp.id)) continue;

        // Resolve or create parent category
        let localCategoryId: string | null = null;
        if (disp.category_id) {
          const existing = await this.repository.findCategoryByBolnaId(
            disp.category_id,
          );
          if (existing) {
            localCategoryId = existing.id;
          } else {
            const catSlug = `bolna-${disp.category_id.slice(0, 8)}-${disp.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            const stub = await this.repository.upsertCategoryByBolnaId({
              bolnaId: disp.category_id,
              slug: catSlug,
              name: disp.category,
              model: disp.model,
              platformAgentId: dto.platformAgentId,
              industry: targetIndustry,
            });
            localCategoryId = stub.id;
            results.categories++;
          }
        }

        if (!localCategoryId) continue;

        const dispSlug = `bolna-${disp.id.slice(0, 8)}-${disp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await this.repository.upsertDispositionByBolnaId({
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
          categoryId: localCategoryId,
          industry: targetIndustry,
        });
        results.dispositions++;
      }
    }

    return results;
  }
}
