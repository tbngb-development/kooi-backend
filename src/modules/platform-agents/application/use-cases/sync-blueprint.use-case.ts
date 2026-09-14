import { Industry } from "@prisma/client";
import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import prisma from "../../../../shared/config/database/prisma";

export class SyncBlueprintUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
    private readonly templateProvider: BolnaTemplateProvider,
  ) {}

  async execute(id: string) {
    const agent = await this.agentRepository.findById(id);
    if (!agent) throw new PlatformAgentNotFoundError(id);

    // 1. Sync agent config
    const template = await this.templateProvider.fetchTemplate(agent.bolnaId);
    const updatedAgent = await this.agentRepository.update(id, {
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });

    // 2. Resolve industry
    let targetIndustry: Industry = Industry.GENERIC;

    if (agent.industryPackId) {
      const pack = await prisma.industryPack.findUnique({
        where: { id: agent.industryPackId },
      });
      if (pack) targetIndustry = pack.industry;
    }

    // 3. Sync extractions
    const extractionSync = { categories: 0, dispositions: 0 };
    try {
      const categoryData = await this.templateProvider.listCategories(
        agent.bolnaId,
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
            platformAgentId: id,
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
      // Best-effort
    }

    return { platformAgent: updatedAgent, extractionSync };
  }
}
