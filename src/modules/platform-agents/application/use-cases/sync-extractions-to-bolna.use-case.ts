import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  BolnaExtractionSyncService,
  BolnaSyncReport,
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

    const apiKeyId = config.bolnaApiKeyId;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: RESET — Wipe local bindings and all remote Bolna data
    // ═══════════════════════════════════════════════════════════════════════

    // 1a. Delete all remote Bolna dispositions from existing local bindings
    //     (best-effort; ignore 404/missing)
    for (const binding of config.bolnaBindings) {
      const errorMsg = await this.syncService.removeDispositionFromBolna(
        binding.bolnaDispositionId,
        apiKeyId,
      );

      report.removed.push({
        dispositionId: binding.dispositionId,
        bolnaDispositionId: binding.bolnaDispositionId,
        action: "removed",
        ...(errorMsg && { error: errorMsg }),
      });
      report.summary.removed++;
    }

    // 1b. Delete all remote Bolna categories for this agent (best-effort)
    //     This handles the case where categories were manually created on Bolna
    //     or where local bindings don't cover all remote artifacts.
    try {
      const remoteCats = await this.syncService.listRemoteCategories(
        config.bolnaId,
        apiKeyId,
      );

      for (const rc of remoteCats) {
        // Best-effort — log but do not fail sync if a category can't be deleted
        await this.syncService.removeCategoryFromBolna(rc.id, apiKeyId);
      }
      
    } catch (err: any) {
      // Non-fatal: continue with rebuild even if listing fails
      const msg = err?.response?.data?.message ?? err?.message ?? "Unknown";
      report.errors.push({
        dispositionId: "-",
        dispositionName: "-",
        error: `Reset phase: failed to list/delete remote categories: ${msg}`,
      });
    }

    // 1c. Clear all local bindings for this agent
    await this.agentRepository.deleteAllBolnaBindings(config.platformAgentId);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: REBUILD — Create fresh categories and dispositions from local
    // ═══════════════════════════════════════════════════════════════════════

    // Track newly created Bolna category IDs (keyed by local category name)
    const freshCategoryMap = new Map<string, string>();

    for (const cat of config.categories) {
      if (cat.dispositions.length === 0) continue;

      // 2a. Create Bolna category (guaranteed fresh — no dedup needed)
      let bolnaCatId: string;
      try {
        bolnaCatId = await this.syncService.ensureBolnaCategory(
          config.bolnaId,
          cat.categoryName,
          cat.model,
          apiKeyId,
        );
        freshCategoryMap.set(cat.categoryName.toLowerCase().trim(), bolnaCatId);
        report.summary.categoriesCreated++;
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.message ?? "Unknown";
        for (const disp of cat.dispositions) {
          report.errors.push({
            dispositionId: disp.dispositionId,
            dispositionName: disp.dispositionName,
            error: `Category "${cat.categoryName}": ${msg}`,
          });
          report.summary.failed++;
        }
        continue;
      }

      // 2b. Create each disposition fresh
      for (const disp of cat.dispositions) {
        report.summary.totalAssigned++;

        const full = await this.extractionRepository.findDispositionById(
          disp.dispositionId,
        );
        if (!full) continue;

        const payload = {
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
        };

        try {
          const bolnaDispId = await this.syncService.syncDispositionToBolna(
            config.bolnaId,
            bolnaCatId,
            payload,
            apiKeyId,
          );

          await this.agentRepository.upsertBolnaBinding({
            platformAgentId: config.platformAgentId,
            dispositionId: full.id,
            bolnaAgentId: config.bolnaId,
            bolnaCategoryId: bolnaCatId,
            bolnaDispositionId: bolnaDispId,
          });

          report.synced.push({
            dispositionId: full.id,
            dispositionName: full.name,
            bolnaDispositionId: bolnaDispId,
            bolnaCategoryId: bolnaCatId,
            action: "created",
          });
          report.summary.created++;
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

    return report;
  }
}
