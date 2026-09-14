import { Industry } from "@prisma/client";
import type { ExtractionRepository } from "../interfaces/extraction-repository.interface";
import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import { ExtractionPlatformAgentRequiredError } from "../../domain/errors/extraction.errors";
import prisma from "../../../../shared/config/database/prisma";

export class SyncDispositionsFromBolnaUseCase {
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

    // Fetch flat disposition list from Bolna (includes category references)
    const bolnaDispositions = await this.bolnaProvider.listDispositions(
      agent.bolnaId,
    );

    const results = [];
    for (const disp of bolnaDispositions) {
      let localCategoryId: string | null = null;

      if (disp.category_id) {
        const existingCategory = await this.repository.findCategoryByBolnaId(
          disp.category_id,
        );
        if (existingCategory) {
          localCategoryId = existingCategory.id;
        } else {
          // Category not yet synced — create a stub so the disposition has a parent
          const slug = `bolna-${disp.category_id.slice(0, 8)}-${disp.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          const stubCategory = await this.repository.upsertCategoryByBolnaId({
            bolnaId: disp.category_id,
            slug,
            name: disp.category,
            model: disp.model,
            platformAgentId,
            industry: targetIndustry,
          });
          localCategoryId = stubCategory.id;
        }
      }

      if (!localCategoryId) {
        // Disposition has no category_id (platform-managed edge case) — skip
        continue;
      }

      const dispSlug = `bolna-${disp.id.slice(0, 8)}-${disp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      const upserted = await this.repository.upsertDispositionByBolnaId({
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

      results.push(upserted);
    }

    return { synced: results.length, dispositions: results };
  }
}
