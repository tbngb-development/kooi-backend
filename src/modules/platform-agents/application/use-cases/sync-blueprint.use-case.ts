import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export class SyncBlueprintUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
    private readonly templateProvider: BolnaTemplateProvider,
  ) {}

  async execute(id: string) {
    // 1. Verify agent exists
    const agent = await this.agentRepository.findById(id);
    if (!agent) throw new PlatformAgentNotFoundError(id);

    // 2. Sync agent blueprint config & prompts from Bolna
    const template = await this.templateProvider.fetchTemplate(
      agent.bolnaId,
      agent.bolnaApiKeyId,
    );
    const updatedAgent = await this.agentRepository.update(id, {
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });

    // 3. Sync extractions from Bolna blueprint into local M2M catalog (best-effort)
    const extractionSync = { categories: 0, dispositions: 0 };

    try {
      const categoryData = await this.templateProvider.listCategories(
        agent.bolnaId,
      );
      const categories = categoryData?.categories ?? [];

      for (const cat of categories) {
        // Find existing category by name (case-insensitive) or create a new catalog entry
        let localCat =
          await this.extractionRepository.findCategoryByNameInsensitive(
            cat.name,
          );

        if (!localCat) {
          localCat = await this.extractionRepository.createCategory({
            name: cat.name,
            model: cat.model ?? "gpt-4.1-mini",
            industryPackIds: agent.industryPackId
              ? [agent.industryPackId]
              : undefined,
          });
        }

        // Assign category to this agent (idempotent)
        await this.agentRepository.assignCategoriesToAgent(id, [localCat.id]);
        extractionSync.categories++;

        // Process category's dispositions
        for (const disp of cat.dispositions ?? []) {
          let localDisp =
            await this.extractionRepository.findDispositionByNameInsensitive(
              disp.name,
            );

          if (!localDisp) {
            localDisp = await this.extractionRepository.createDisposition({
              name: disp.name,
              question: disp.question,
              systemPrompt: disp.system_prompt ?? undefined,
              model: disp.model ?? "gpt-4.1-mini",
              isSubjective: disp.is_subjective ?? false,
              isObjective: disp.is_objective ?? false,
              subjectiveType: disp.subjective_type ?? "text",
              subjectiveTypeConfig:
                (disp.subjective_type_config as unknown as Record<
                  string,
                  unknown
                >) ?? undefined,
              objectiveOptions:
                (disp.objective_options as unknown as Record<
                  string,
                  unknown
                >[]) ?? undefined,
              industryPackIds: agent.industryPackId
                ? [agent.industryPackId]
                : undefined,
            });
          }

          // Link disposition to category (idempotent)
          await this.extractionRepository.attachDispositionsToCategory(
            localCat.id,
            [localDisp.id],
          );

          // Record Bolna binding for sync parity
          await this.agentRepository.upsertBolnaBinding({
            platformAgentId: id,
            dispositionId: localDisp.id,
            bolnaAgentId: agent.bolnaId,
            bolnaCategoryId: cat.id,
            bolnaDispositionId: disp.id,
          });

          extractionSync.dispositions++;
        }
      }
    } catch (err) {
      // Best-effort: log and return what succeeded
      console.error("[SyncBlueprintUseCase] Extractions sync error:", err);
    }

    return { platformAgent: updatedAgent, extractionSync };
  }
}
