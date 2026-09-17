import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  BolnaExtractionSyncService,
  BolnaSyncReport,
  RemovedDispositionResult,
} from "../interfaces/bolna-extraction-sync.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export class SyncExtractionsToBolnaUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
    private readonly syncService: BolnaExtractionSyncService,
  ) {}

  async execute(platformAgentId: string): Promise<BolnaSyncReport> {
    const config =
      await this.agentRepository.getAgentExtractionConfig(platformAgentId);
    if (!config) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

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

    // All dispositions are now in categories (including "General")
    const activeDispositionIds = new Set<string>();
    const bolnaCategoryCache = new Map<string, string>();

    for (const cat of config.categories) {
      if (cat.dispositions.length === 0) continue;

      // Ensure category exists on Bolna
      let bolnaCatId: string | undefined;
      try {
        bolnaCatId = await this.syncService.ensureBolnaCategory(
          config.bolnaId,
          cat.categoryName,
          cat.model,
          config.bolnaApiKeyId, 
        );
        bolnaCategoryCache.set(cat.categoryId, bolnaCatId);
        report.summary.categoriesCreated++;
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.message ?? "Unknown";
        for (const disp of cat.dispositions) {
          report.errors.push({
            dispositionId: disp.dispositionId,
            dispositionName: disp.dispositionName,
            error: `Category "${cat.categoryName}" sync failed: ${msg}`,
          });
          report.summary.failed++;
        }
        continue;
      }

      // Sync each disposition in this category
      for (const disp of cat.dispositions) {
        activeDispositionIds.add(disp.dispositionId);
        report.summary.totalAssigned++;

        const full = await this.extractionRepository.findDispositionById(
          disp.dispositionId,
        );
        if (!full) continue;

        const existingBinding = config.bolnaBindings.find(
          (b) => b.dispositionId === disp.dispositionId,
        );

        try {
          const bolnaDispId = await this.syncService.syncDispositionToBolna(
            config.bolnaId,
            bolnaCatId,
            {
              id: full.id,
              name: full.name,
              question: full.question,
              systemPrompt: full.systemPrompt,
              model: full.model,
              isSubjective: full.isSubjective,
              isObjective: full.isObjective,
              subjectiveType: full.subjectiveType,
              subjectiveTypeConfig: full.subjectiveTypeConfig,
              objectiveOptions: full.objectiveOptions,
            },
            config.bolnaApiKeyId, // ✅ Fixed: pass config.bolnaApiKeyId instead of existingBinding.bolnaDispositionId
          );

          const action = existingBinding ? "updated" : "created";

          await this.agentRepository.upsertBolnaBinding({
            platformAgentId: config.platformAgentId,
            dispositionId: full.id,
            bolnaAgentId: config.bolnaId,
            bolnaCategoryId: bolnaCatId!,
            bolnaDispositionId: bolnaDispId,
          });

          report.synced.push({
            dispositionId: full.id,
            dispositionName: full.name,
            bolnaDispositionId: bolnaDispId,
            bolnaCategoryId: bolnaCatId!,
            action,
          });

          if (action === "created") report.summary.created++;
          else report.summary.updated++;
        } catch (err: any) {
          const msg = err?.response?.data?.message ?? err?.message ?? "Unknown";
          report.errors.push({
            dispositionId: full.id,
            dispositionName: full.name,
            error: msg,
          });
          report.summary.failed++;
        }
      }
    }

    // Remove stale bindings
    const staleBindings = config.bolnaBindings.filter(
      (b) => !activeDispositionIds.has(b.dispositionId),
    );

    for (const stale of staleBindings) {
      const errorMsg = await this.syncService.removeDispositionFromBolna(
        stale.bolnaDispositionId,
        config.bolnaApiKeyId, 
      );

      const result: RemovedDispositionResult = {
        dispositionId: stale.dispositionId,
        bolnaDispositionId: stale.bolnaDispositionId,
        action: "removed",
      };

      if (errorMsg) {
        result.error = errorMsg;
        report.summary.failed++;
      } else {
        report.summary.removed++;
      }

      report.removed.push(result);

      await this.agentRepository.deleteBolnaBindings(config.platformAgentId, [
        stale.dispositionId,
      ]);
    }

    return report;
  }
}
