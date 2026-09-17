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

    const apiKeyId = config.bolnaApiKeyId;

    // ── Step 1: Fetch remote categories ONCE for dedup ────────────────────
    // Maps lowercase category name → Bolna category ID
    const remoteCatMap = new Map<string, string>();
    try {
      const remoteCats = await this.syncService.listRemoteCategories(
        config.bolnaId,
        apiKeyId,
      );
      for (const rc of remoteCats) {
        remoteCatMap.set(rc.name.toLowerCase().trim(), rc.id);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? "Unknown";
      report.errors.push({
        dispositionId: "-",
        dispositionName: "-",
        error: `Failed to list remote categories: ${msg}`,
      });
      report.summary.failed++;
      return report;
    }

    const activeDispositionIds = new Set<string>();

    // ── Step 2: Walk each local category → disposition ────────────────────
    for (const cat of config.categories) {
      if (cat.dispositions.length === 0) continue;

      // 2a. Resolve Bolna category (create only if missing)
      let bolnaCatId = remoteCatMap.get(cat.categoryName.toLowerCase().trim());

      if (!bolnaCatId) {
        try {
          bolnaCatId = await this.syncService.ensureBolnaCategory(
            config.bolnaId,
            cat.categoryName,
            cat.model,
            apiKeyId,
          );
          remoteCatMap.set(cat.categoryName.toLowerCase().trim(), bolnaCatId);
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
      }

      // 2b. Sync each disposition
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
          if (existingBinding) {
            // ── UPDATE existing (PUT /dispositions/{id}) ──────────────────
            // Bolna's copy-on-write may return a new ID, but since we
            // use PUT, the ID stays the same for private dispositions.
            await this.syncService.updateDispositionOnBolna(
              existingBinding.bolnaDispositionId,
              payload,
              apiKeyId,
            );

            report.synced.push({
              dispositionId: full.id,
              dispositionName: full.name,
              bolnaDispositionId: existingBinding.bolnaDispositionId,
              bolnaCategoryId: existingBinding.bolnaCategoryId,
              action: "updated",
            });
            report.summary.updated++;
          } else {
            // ── CREATE new (POST /dispositions/) ─────────────────────────
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
              bolnaCategoryId: bolnaCatId!,
              bolnaDispositionId: bolnaDispId,
            });

            report.synced.push({
              dispositionId: full.id,
              dispositionName: full.name,
              bolnaDispositionId: bolnaDispId,
              bolnaCategoryId: bolnaCatId!,
              action: "created",
            });
            report.summary.created++;
          }
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

    // ── Step 3: Remove stale bindings ─────────────────────────────────────
    const staleBindings = config.bolnaBindings.filter(
      (b) => !activeDispositionIds.has(b.dispositionId),
    );

    for (const stale of staleBindings) {
      const errorMsg = await this.syncService.removeDispositionFromBolna(
        stale.bolnaDispositionId,
        apiKeyId,
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
