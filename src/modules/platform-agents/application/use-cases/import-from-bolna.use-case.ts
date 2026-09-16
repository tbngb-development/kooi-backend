import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import {
  DuplicatePlatformAgentBolnaIdError,
  DuplicatePlatformAgentSlugError,
} from "../../domain/errors/platform-agent.errors";

export interface ImportFromBolnaDTO {
  bolnaId: string;
  slug?: string;
  name?: string;
  industryPackId?: string;
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
    // 1. Check duplicate Bolna ID
    const existing = await this.agentRepository.findByBolnaId(dto.bolnaId);
    if (existing) throw new DuplicatePlatformAgentBolnaIdError(dto.bolnaId);

    // 2. Fetch blueprint template from Bolna
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

    // 4. Create PlatformAgent template record
    const platformAgent = await this.agentRepository.create({
      bolnaId: dto.bolnaId,
      slug,
      name: dto.name ?? template.agentName,
      industryPackId: dto.industryPackId,
      category: dto.category,
      description: dto.description,
      isFeatured: dto.isFeatured,
      sortOrder: dto.sortOrder,
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });

    // 5. Auto-sync extractions into local M2M catalog if requested (default: true)
    const extractionSync = { categories: 0, dispositions: 0 };

    if (dto.includeExtractions !== false) {
      try {
        const categoryData = await this.templateProvider.listCategories(
          dto.bolnaId,
        );
        const categories = categoryData?.categories ?? [];

        for (const cat of categories) {
          // Find existing catalog category or create a new entry
          let localCat =
            await this.extractionRepository.findCategoryByNameInsensitive(
              cat.name,
            );

          if (!localCat) {
            localCat = await this.extractionRepository.createCategory({
              name: cat.name,
              model: cat.model ?? "gpt-4.1-mini",
              industryPackIds: dto.industryPackId
                ? [dto.industryPackId]
                : undefined,
            });
          }

          // Assign category to the newly created agent (idempotent)
          await this.agentRepository.assignCategoriesToAgent(platformAgent.id, [
            localCat.id,
          ]);
          extractionSync.categories++;

          // Process dispositions in this category
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
                industryPackIds: dto.industryPackId
                  ? [dto.industryPackId]
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
              platformAgentId: platformAgent.id,
              dispositionId: localDisp.id,
              bolnaAgentId: dto.bolnaId,
              bolnaCategoryId: cat.id,
              bolnaDispositionId: disp.id,
            });

            extractionSync.dispositions++;
          }
        }
      } catch (err) {
        // Extractions import is best-effort; agent registration remains successful
        console.error(
          "[ImportFromBolnaUseCase] Extractions import error:",
          err,
        );
      }
    }

    return {
      platformAgent,
      extractionSync,
    };
  }
}
