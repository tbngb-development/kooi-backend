// modules/batches/application/use-cases/sync-sarvam-cohort-lifecycle.use-case.ts

import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { ISarvamCohortClient } from "../interfaces/sarvam-cohort-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { mapSarvamCohortStatusToKooi } from "../../../campaigns/domain/rules/sarvam-status-mapper";

export interface SyncSarvamCohortLifecycleResult {
  syncedCount: number;
  updatedCount: number;
  errors: Array<{ batchId: string; error: string }>;
}

export class SyncSarvamCohortLifecycleUseCase {
  private readonly log?: Logger;

  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
    private readonly sarvamCohortClient: ISarvamCohortClient,
    private readonly sarvamEncryptionService: ISarvamApiKeyEncryptionService,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "SyncSarvamCohortLifecycleUseCase" });
  }

  async execute(): Promise<SyncSarvamCohortLifecycleResult> {
    const processingBatches = await this.batchRepo.findProcessingSarvamBatches();

    if (processingBatches.length === 0) {
      return { syncedCount: 0, updatedCount: 0, errors: [] };
    }

    let updatedCount = 0;
    const errors: Array<{ batchId: string; error: string }> = [];

    for (const batch of processingBatches) {
      try {
        const campaign = await this.campaignRepo.findById(
          batch.tenantId,
          batch.campaignId,
        );

        if (!campaign || !campaign.sarvamAgentId || !campaign.sarvamCampaignId) {
          this.log?.warn("Skipping Sarvam cohort sync: campaign or Sarvam IDs missing", {
            action: "sarvam.cohort_sync.missing_campaign_info",
            batchId: batch.id,
            campaignId: batch.campaignId,
          });
          continue;
        }

        const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
          batch.tenantId,
          campaign.sarvamAgentId,
        );

        if (!sarvamAgent || !sarvamAgent.apiKey) {
          this.log?.warn("Skipping Sarvam cohort sync: missing agent or API key credentials", {
            action: "sarvam.cohort_sync.missing_credentials",
            batchId: batch.id,
            sarvamAgentId: campaign.sarvamAgentId,
          });
          continue;
        }

        const apiKey = this.sarvamEncryptionService.decrypt(
          sarvamAgent.apiKey.apiKeyEncrypted,
        );

        const cohortResponse = await this.sarvamCohortClient.getCohort({
          organizationId: sarvamAgent.apiKey.organizationId,
          workspaceId: sarvamAgent.apiKey.workspaceId,
          campaignId: campaign.sarvamCampaignId,
          cohortId: batch.sarvamCohortId,
          apiKey,
        });

        const remoteStatus = cohortResponse.status;
        const cohortResult = cohortResponse.result
          ? {
              total_records: cohortResponse.result.total_records,
              valid_records: cohortResponse.result.valid_records,
              rejected_records: cohortResponse.result.rejected_records,
            }
          : null;

        const mappedBatchStatus = mapSarvamCohortStatusToKooi(remoteStatus);

        const statusChanged =
          remoteStatus !== batch.sarvamStatus ||
          (remoteStatus !== "processing" && batch.status === "PROCESSING");

        if (statusChanged || cohortResult) {
          const errorMessage =
            remoteStatus === "failed"
              ? "Sarvam cohort processing failed at voice provider."
              : null;

          await this.batchRepo.updateSarvamCohortStatus(
            batch.id,
            remoteStatus,
            mappedBatchStatus,
            cohortResult,
            errorMessage,
          );

          updatedCount++;
          this.log?.info("Synchronized Sarvam cohort status", {
            action: "sarvam.cohort_sync.updated",
            batchId: batch.id,
            sarvamCohortId: batch.sarvamCohortId,
            previousSarvamStatus: batch.sarvamStatus,
            newSarvamStatus: remoteStatus,
            previousKooiStatus: batch.status,
            newKooiStatus: mappedBatchStatus,
            cohortResult,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ batchId: batch.id, error: errorMsg });
        this.log?.error("Failed to sync Sarvam cohort lifecycle", err, {
          action: "sarvam.cohort_sync.error",
          batchId: batch.id,
          sarvamCohortId: batch.sarvamCohortId,
        });
      }
    }

    return {
      syncedCount: processingBatches.length,
      updatedCount,
      errors,
    };
  }
}

