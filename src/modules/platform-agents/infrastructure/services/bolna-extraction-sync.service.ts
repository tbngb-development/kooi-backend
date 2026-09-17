import type { BolnaExtractionProvider } from "../../../extractions/application/interfaces/bolna-extraction-provider.interface";
import type {
  AgentExtractionConfig,
  PlatformAgentRepository,
} from "../../application/interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  BolnaExtractionSyncService,
  BolnaSyncReport,
  SyncedDispositionResult,
  SyncError,
} from "../../application/interfaces/bolna-extraction-sync.interface";

export class BolnaExtractionSyncServiceImpl implements BolnaExtractionSyncService {
  constructor(private readonly extractionProvider: BolnaExtractionProvider) {}

  async syncAgentExtractions(
    config: AgentExtractionConfig,
    extractionRepo: ExtractionRepository,
    agentRepo: PlatformAgentRepository,
  ): Promise<BolnaSyncReport> {
    const report: BolnaSyncReport = {
      platformAgentId: config.platformAgentId,
      bolnaAgentId: config.bolnaId,
      synced: [],
      removed: [],
      errors: [],
      summary: {
        totalAssigned: 0,
        categoriesCreated: 0,
        created: 0,
        updated: 0,
        removed: 0,
        failed: 0,
      },
    };

    const bolnaApiKeyId = config.bolnaApiKeyId;

    let remoteCategoriesResponse;
    try {
      remoteCategoriesResponse = await this.extractionProvider.listCategories(
        config.bolnaId,
        bolnaApiKeyId,
      );
    } catch (err: any) {
      report.errors.push({
        dispositionId: "-",
        dispositionName: "-",
        error: `Failed to list remote categories: ${err.message}`,
      });
      report.summary.failed += 1;
      return report;
    }

    const remoteCategoryMap = new Map<string, string>();
    for (const cat of remoteCategoriesResponse.categories || []) {
      remoteCategoryMap.set(cat.name.toLowerCase().trim(), cat.id);
    }

    for (const catConfig of config.categories) {
      let bolnaCategoryId = remoteCategoryMap.get(
        catConfig.categoryName.toLowerCase().trim(),
      );

      if (!bolnaCategoryId) {
        try {
          bolnaCategoryId = await this.ensureBolnaCategory(
            config.bolnaId,
            catConfig.categoryName,
            catConfig.model,
            bolnaApiKeyId,
          );
          remoteCategoryMap.set(
            catConfig.categoryName.toLowerCase().trim(),
            bolnaCategoryId,
          );
          report.summary.categoriesCreated += 1;
        } catch (err: any) {
          report.errors.push({
            dispositionId: "-",
            dispositionName: catConfig.categoryName,
            error: `Failed to create category '${catConfig.categoryName}': ${err.message}`,
          });
          continue;
        }
      }

      for (const dispRef of catConfig.dispositions) {
        report.summary.totalAssigned += 1;

        const fullDisp = await extractionRepo.findDispositionById(
          dispRef.dispositionId,
        );
        if (!fullDisp) continue;

        const existingBinding = config.bolnaBindings.find(
          (b) => b.dispositionId === dispRef.dispositionId,
        );

        if (!existingBinding) {
          try {
            const bolnaDispId = await this.syncDispositionToBolna(
              config.bolnaId,
              bolnaCategoryId,
              fullDisp,
              bolnaApiKeyId,
            );

            await agentRepo.upsertBolnaBinding({
              platformAgentId: config.platformAgentId,
              dispositionId: fullDisp.id,
              bolnaAgentId: config.bolnaId,
              bolnaCategoryId,
              bolnaDispositionId: bolnaDispId,
            });

            const synced: SyncedDispositionResult = {
              dispositionId: fullDisp.id,
              dispositionName: fullDisp.name,
              bolnaDispositionId: bolnaDispId,
              bolnaCategoryId,
              action: "created",
            };
            report.synced.push(synced);
            report.summary.created += 1;
          } catch (err: any) {
            const syncErr: SyncError = {
              dispositionId: fullDisp.id,
              dispositionName: fullDisp.name,
              error: `Failed to create disposition '${fullDisp.name}': ${err.message}`,
            };
            report.errors.push(syncErr);
            report.summary.failed += 1;
          }
        } else {
          report.summary.updated += 1;
        }
      }
    }

    return report;
  }

  async ensureBolnaCategory(
    agentId: string,
    categoryName: string,
    model: string,
    bolnaApiKeyId?: string,
  ): Promise<string> {
    const createdCat = await this.extractionProvider.createCategory(
      agentId,
      { name: categoryName, model },
      bolnaApiKeyId,
    );
    return createdCat.id;
  }

  async syncDispositionToBolna(
    agentId: string,
    categoryId: string,
    disposition: any,
    bolnaApiKeyId?: string,
  ): Promise<string> {
    const createdDisp = await this.extractionProvider.createDisposition(
      {
        agent_id: agentId,
        category_id: categoryId,
        name: disposition.name,
        question: disposition.question,
        system_prompt: disposition.systemPrompt ?? undefined,
        model: disposition.model,
        is_subjective: disposition.isSubjective,
        is_objective: disposition.isObjective,
        subjective_type: disposition.subjectiveType,
        subjective_type_config: disposition.subjectiveTypeConfig as any,
        objective_options: disposition.objectiveOptions as any,
      },
      bolnaApiKeyId,
    );
    return createdDisp.id;
  }

  async removeDispositionFromBolna(
    dispositionId: string,
    bolnaApiKeyId?: string,
  ): Promise<string | null> {
    try {
      await this.extractionProvider.deleteDisposition(
        dispositionId,
        bolnaApiKeyId,
      );
      return null;
    } catch (err: any) {
      return err.message;
    }
  }
}
