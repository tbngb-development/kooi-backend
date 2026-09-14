import { Industry } from "@prisma/client";
import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import { ExtractionPlatformAgentRequiredError } from "../../domain/errors/extraction.errors";
import prisma from "../../../../shared/config/database/prisma";

export class SyncCategoriesFromBolnaUseCase {
  constructor(
    private readonly repository: ExtractionRepository,
    private readonly bolnaProvider: BolnaExtractionProvider,
  ) {}

  async execute(platformAgentId: string) {
    const agent = await prisma.platformAgent.findUnique({
      where: { id: platformAgentId },
      include: { industryPack: true },
    });
    if (!agent?.bolnaId) throw new ExtractionPlatformAgentRequiredError();

    const targetIndustry: Industry =
      agent.industryPack?.industry ?? Industry.GENERIC;

    const bolnaData = await this.bolnaProvider.listCategories(agent.bolnaId);
    const categories = bolnaData.categories ?? [];

    const results = [];
    for (const cat of categories) {
      const slug = `bolna-${cat.id.slice(0, 8)}-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      const upserted = await this.repository.upsertCategoryByBolnaId({
        bolnaId: cat.id,
        slug,
        name: cat.name,
        model: cat.model,
        platformAgentId,
        industry: targetIndustry,
      });

      // Sync nested dispositions
      if (cat.dispositions?.length) {
        for (const disp of cat.dispositions) {
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
            categoryId: upserted.id,
            industry: targetIndustry,
          });
        }
      }

      results.push(upserted);
    }

    return { synced: results.length, categories: results };
  }
}
