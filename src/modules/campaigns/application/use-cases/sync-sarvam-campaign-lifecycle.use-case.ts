// modules/campaigns/application/use-cases/sync-sarvam-campaign-lifecycle.use-case.ts

import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../../batches/application/interfaces/batch-repository.interface";
import type { ISarvamCampaignClient } from "../../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { mapSarvamCampaignStatusToKooi } from "../../domain/rules/sarvam-status-mapper";

export interface SyncSarvamCampaignLifecycleResult {
  syncedCount: number;
  updatedCount: number;
  errors: Array<{ campaignId: string; error: string }>;
}

export class SyncSarvamCampaignLifecycleUseCase {
  private readonly log?: Logger;

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly batchRepo: BatchRepository,
    private readonly sarvamCampaignClient: ISarvamCampaignClient,
    private readonly sarvamEncryptionService: ISarvamApiKeyEncryptionService,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "SyncSarvamCampaignLifecycleUseCase" });
  }

  async execute(): Promise<SyncSarvamCampaignLifecycleResult> {
    const activeCampaigns = await this.campaignRepo.findActiveSarvamCampaigns();

    if (activeCampaigns.length === 0) {
      return { syncedCount: 0, updatedCount: 0, errors: [] };
    }

    let updatedCount = 0;
    const errors: Array<{ campaignId: string; error: string }> = [];

    for (const campaign of activeCampaigns) {
      try {
        const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
          campaign.tenantId,
          campaign.sarvamAgentId,
        );

        if (!sarvamAgent || !sarvamAgent.apiKey) {
          this.log?.warn("Skipping Sarvam campaign sync: missing agent or API key credentials", {
            action: "sarvam.campaign_sync.missing_credentials",
            campaignId: campaign.id,
            sarvamCampaignId: campaign.sarvamCampaignId,
            sarvamAgentId: campaign.sarvamAgentId,
          });
          continue;
        }

        const apiKey = this.sarvamEncryptionService.decrypt(
          sarvamAgent.apiKey.apiKeyEncrypted,
        );

        const remoteCampaign = await this.sarvamCampaignClient.getCampaign(
          sarvamAgent.apiKey.organizationId,
          sarvamAgent.apiKey.workspaceId,
          campaign.sarvamCampaignId,
          apiKey,
        );

        const remoteStatus = remoteCampaign.status;
        const mappedStatus = mapSarvamCampaignStatusToKooi(remoteStatus);

        const statusChanged =
          remoteStatus !== campaign.sarvamStatus || mappedStatus !== campaign.status;

        if (statusChanged) {
          const isTerminal = mappedStatus === "COMPLETED" || mappedStatus === "CANCELLED";
          const extra = isTerminal ? { completedAt: new Date() } : undefined;

          await this.campaignRepo.updateSarvamStatus(
            campaign.id,
            remoteStatus,
            mappedStatus,
            extra,
          );

          if (isTerminal) {
            try {
              await this.batchRepo.recalculateCampaignStats(campaign.id);
            } catch (statsErr) {
              this.log?.warn("Failed to recalculate campaign stats on status completion", {
                campaignId: campaign.id,
                error: statsErr instanceof Error ? statsErr.message : String(statsErr),
              });
            }
          }

          updatedCount++;
          this.log?.info("Synchronized Sarvam campaign status", {
            action: "sarvam.campaign_sync.updated",
            campaignId: campaign.id,
            sarvamCampaignId: campaign.sarvamCampaignId,
            previousSarvamStatus: campaign.sarvamStatus,
            newSarvamStatus: remoteStatus,
            previousKooiStatus: campaign.status,
            newKooiStatus: mappedStatus,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ campaignId: campaign.id, error: errorMsg });
        this.log?.error("Failed to sync Sarvam campaign lifecycle", err, {
          action: "sarvam.campaign_sync.error",
          campaignId: campaign.id,
          sarvamCampaignId: campaign.sarvamCampaignId,
        });
      }
    }

    return {
      syncedCount: activeCampaigns.length,
      updatedCount,
      errors,
    };
  }
}
