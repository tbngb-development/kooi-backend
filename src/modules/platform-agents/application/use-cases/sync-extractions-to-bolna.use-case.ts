// modules/platform-agents/application/use-cases/sync-extractions-to-bolna.use-case.ts

import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  BolnaExtractionSyncService,
  BolnaSyncReport,
} from "../interfaces/bolna-extraction-sync.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class SyncExtractionsToBolnaUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
    private readonly syncService: BolnaExtractionSyncService,
    private readonly log?: Logger,
  ) {}

  async execute(platformAgentId: string): Promise<BolnaSyncReport> {
    this.log?.info("Starting Bolna extraction sync", {
      action: "bolna.sync.start",
      platformAgentId,
    });

    const config =
      await this.agentRepository.getAgentExtractionConfig(platformAgentId);
    if (!config) {
      this.log?.error("Platform agent not found for extraction sync", null, {
        action: "bolna.sync.agent_not_found",
        platformAgentId,
      });
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

    this.log?.info("Agent extraction config loaded", {
      action: "bolna.sync.config_loaded",
      platformAgentId,
      bolnaAgentId: config.bolnaId,
      categoriesCount: config.categories.length,
      existingBindingsCount: config.bolnaBindings.length,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: RESET — Wipe local bindings and all remote Bolna data
    // ═══════════════════════════════════════════════════════════════════════

    // 1a. Delete all remote Bolna dispositions from existing local bindings
    for (const binding of config.bolnaBindings) {
      this.log?.debug("Removing remote Bolna disposition binding", {
        action: "bolna.sync.remove_disposition",
        bolnaDispositionId: binding.bolnaDispositionId,
        dispositionId: binding.dispositionId,
      });

      const errorMsg = await this.syncService.removeDispositionFromBolna(
        binding.bolnaDispositionId,
        apiKeyId,
      );

      if (errorMsg) {
        this.log?.warn(
          "Failed to remove remote Bolna disposition (non-fatal)",
          {
            action: "bolna.sync.remove_disposition_failed",
            bolnaDispositionId: binding.bolnaDispositionId,
            error: errorMsg,
          },
        );
      }

      report.removed.push({
        dispositionId: binding.dispositionId,
        bolnaDispositionId: binding.bolnaDispositionId,
        action: "removed",
        ...(errorMsg && { error: errorMsg }),
      });
      report.summary.removed++;
    }

    // 1b. Delete all remote Bolna categories for this agent
    try {
      this.log?.debug("Listing remote Bolna categories for reset", {
        bolnaAgentId: config.bolnaId,
      });

      const remoteCats = await this.syncService.listRemoteCategories(
        config.bolnaId,
        apiKeyId,
      );

      this.log?.debug("Found remote Bolna categories to remove", {
        count: remoteCats.length,
        categories: remoteCats.map((c) => ({ id: c.id, name: c.name })),
      });

      for (const rc of remoteCats) {
        await this.syncService.removeCategoryFromBolna(rc.id, apiKeyId);
      }
    } catch (err: any) {
      const errorDetail = this.extractErrorDetails(err);
      this.log?.warn("Reset phase: failed to list/delete remote categories", {
        action: "bolna.sync.remote_categories_reset_failed",
        bolnaAgentId: config.bolnaId,
        ...errorDetail,
      });

      report.errors.push({
        dispositionId: "-",
        dispositionName: "-",
        error: `Reset phase: failed to list/delete remote categories: ${errorDetail.message}`,
      });
    }

    // 1c. Clear all local bindings for this agent
    await this.agentRepository.deleteAllBolnaBindings(config.platformAgentId);
    this.log?.debug("Deleted all local Bolna bindings from DB", {
      platformAgentId: config.platformAgentId,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: REBUILD — Create fresh categories and dispositions from local
    // ═══════════════════════════════════════════════════════════════════════

    const freshCategoryMap = new Map<string, string>();

    for (const cat of config.categories) {
      if (cat.dispositions.length === 0) {
        this.log?.debug("Skipping category with 0 dispositions", {
          categoryName: cat.categoryName,
        });
        continue;
      }

      // 2a. Create Bolna category
      let bolnaCatId: string;
      try {
        this.log?.info("Creating Bolna category", {
          action: "bolna.sync.create_category",
          bolnaAgentId: config.bolnaId,
          categoryName: cat.categoryName,
          model: cat.model,
        });

        bolnaCatId = await this.syncService.ensureBolnaCategory(
          config.bolnaId,
          cat.categoryName,
          cat.model,
          apiKeyId,
        );
        freshCategoryMap.set(cat.categoryName.toLowerCase().trim(), bolnaCatId);
        report.summary.categoriesCreated++;

        this.log?.info("Bolna category created successfully", {
          action: "bolna.sync.category_created",
          categoryName: cat.categoryName,
          bolnaCategoryId: bolnaCatId,
        });
      } catch (err: any) {
        const errorDetail = this.extractErrorDetails(err);
        this.log?.error("Failed to create Bolna category", err, {
          action: "bolna.sync.create_category_failed",
          categoryName: cat.categoryName,
          bolnaAgentId: config.bolnaId,
          ...errorDetail,
        });

        for (const disp of cat.dispositions) {
          report.errors.push({
            dispositionId: disp.dispositionId,
            dispositionName: disp.dispositionName,
            error: `Category "${cat.categoryName}": ${errorDetail.message}`,
          });
          report.summary.failed++;
        }
        continue;
      }

      // 2b. Create each disposition under the newly created category
      for (const disp of cat.dispositions) {
        report.summary.totalAssigned++;

        const full = await this.extractionRepository.findDispositionById(
          disp.dispositionId,
        );
        if (!full) {
          this.log?.warn("Disposition not found in DB, skipping", {
            dispositionId: disp.dispositionId,
            dispositionName: disp.dispositionName,
          });
          continue;
        }

        const payload = {
          id: full.id,
          name: full.name,
          question: full.question,
          systemPrompt: full.systemPrompt,
          model: full.model,
          isSubjective: full.isSubjective,
          isObjective: full.isObjective,
          subjectiveType: full.isSubjective ? full.subjectiveType : null,
          subjectiveTypeConfig: full.isSubjective
            ? full.subjectiveTypeConfig
            : null,
          objectiveOptions: full.isObjective ? full.objectiveOptions : null,
        };

        try {
          this.log?.info("Syncing disposition to Bolna", {
            action: "bolna.sync.create_disposition",
            dispositionId: full.id,
            dispositionName: full.name,
            bolnaCategoryId: bolnaCatId,
            isObjective: full.isObjective,
            isSubjective: full.isSubjective,
          });

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

          this.log?.info("Disposition synced to Bolna successfully", {
            action: "bolna.sync.disposition_created",
            dispositionId: full.id,
            dispositionName: full.name,
            bolnaDispositionId: bolnaDispId,
          });
        } catch (err: any) {
          const errorDetail = this.extractErrorDetails(err);
          this.log?.error("Failed to sync disposition to Bolna", err, {
            action: "bolna.sync.create_disposition_failed",
            dispositionId: full.id,
            dispositionName: full.name,
            bolnaAgentId: config.bolnaId,
            bolnaCategoryId: bolnaCatId,
            payload,
            ...errorDetail,
          });

          report.errors.push({
            dispositionId: full.id,
            dispositionName: full.name,
            error: errorDetail.message,
          });
          report.summary.failed++;
        }
      }
    }

    this.log?.info("Bolna extraction sync completed", {
      action: "bolna.sync.complete",
      platformAgentId,
      summary: report.summary,
      errorsCount: report.errors.length,
    });

    return report;
  }

  /**
   * Helper to extract detailed HTTP status, response body, or error message
   * from Axios or generic errors.
   */
  private extractErrorDetails(err: any): {
    message: string;
    statusCode?: number;
    responseData?: unknown;
  } {
    const responseData = err?.response?.data;
    const statusCode = err?.response?.status;
    const message =
      responseData?.message ??
      responseData?.error ??
      (typeof responseData === "string" ? responseData : null) ??
      err?.message ??
      "Unknown error";

    return {
      message,
      statusCode,
      responseData,
    };
  }
}
