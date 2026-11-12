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
        const isExpired = Boolean(
          campaign.endTimestamp &&
            new Date().getTime() >= new Date(campaign.endTimestamp).getTime(),
        );

        let remoteStatus = campaign.sarvamStatus ?? "active";
        let mappedStatus = campaign.status;

        const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
          campaign.tenantId,
          campaign.sarvamAgentId,
        );

        if (sarvamAgent && sarvamAgent.apiKey) {
          try {
            const apiKey = this.sarvamEncryptionService.decrypt(
              sarvamAgent.apiKey.apiKeyEncrypted,
            );

            const remoteCampaign = await this.sarvamCampaignClient.getCampaign(
              sarvamAgent.apiKey.organizationId,
              sarvamAgent.apiKey.workspaceId,
              campaign.sarvamCampaignId,
              apiKey,
            );

            remoteStatus = remoteCampaign.status;
            mappedStatus = mapSarvamCampaignStatusToKooi(remoteStatus);
          } catch (fetchErr) {
            if (!isExpired) {
              throw fetchErr;
            }
            this.log?.warn(
              "Failed to fetch remote Sarvam status for expired campaign; proceeding with local expiration",
              {
                campaignId: campaign.id,
                error:
                  fetchErr instanceof Error
                    ? fetchErr.message
                    : String(fetchErr),
              },
            );
          }
        } else if (!isExpired) {
          this.log?.warn(
            "Skipping Sarvam campaign sync: missing agent or API key credentials",
            {
              action: "sarvam.campaign_sync.missing_credentials",
              campaignId: campaign.id,
              sarvamCampaignId: campaign.sarvamCampaignId,
              sarvamAgentId: campaign.sarvamAgentId,
            },
          );
          continue;
        }

        let effectiveKooiStatus = mappedStatus;
        if (isExpired && effectiveKooiStatus !== "CANCELLED") {
          effectiveKooiStatus = "COMPLETED";
        }

        if (effectiveKooiStatus === "RUNNING" && campaign.status !== "RUNNING") {
          try {
            const activeCount = await this.campaignRepo.countActiveCampaignsForAgent(
              campaign.sarvamAgentId,
              campaign.id,
            );
            if (activeCount >= 5) {
              this.log?.warn(
                "External Sarvam campaign status is active while local running count is at capacity",
                {
                  action: "sarvam.campaign_sync.capacity_warning",
                  campaignId: campaign.id,
                  sarvamAgentId: campaign.sarvamAgentId,
                  activeCount,
                },
              );
            }
          } catch {
            // Non-blocking check for capacity observability
          }
        }

        const isTerminal =
          effectiveKooiStatus === "COMPLETED" ||
          effectiveKooiStatus === "CANCELLED";

        const statusChanged =
          remoteStatus !== campaign.sarvamStatus ||
          effectiveKooiStatus !== campaign.status;

        if (statusChanged || (isExpired && campaign.status !== "COMPLETED")) {
          const extra = isTerminal ? { completedAt: new Date() } : undefined;

          await this.campaignRepo.updateSarvamStatus(
            campaign.id,
            remoteStatus,
            effectiveKooiStatus,
            extra,
          );

          if (isTerminal) {
            try {
              const batches =
                (await this.batchRepo.list?.(
                  campaign.tenantId,
                  campaign.id,
                  false,
                )) ?? [];
              const activeStatuses = [
                "RUNNING",
                "SCHEDULED",
                "PROCESSING",
                "CREATED",
              ];
              const unfinishedBatches = batches.filter((b) =>
                activeStatuses.includes(b.status),
              );

              for (const batch of unfinishedBatches) {
                try {
                  await this.batchRepo.markPendingLeadsAsStopped?.(
                    batch.id,
                    "MANUAL",
                  );
                } catch (leadErr) {
                  this.log?.warn(
                    "Failed to mark pending leads as stopped during campaign termination",
                    {
                      batchId: batch.id,
                      campaignId: campaign.id,
                      error:
                        leadErr instanceof Error
                          ? leadErr.message
                          : String(leadErr),
                    },
                  );
                }
              }

              if (unfinishedBatches.length > 0) {
                await this.batchRepo.cascadeStatusFromCampaign?.(
                  campaign.id,
                  "STOPPED",
                );
              }

              await this.batchRepo.recalculateCampaignStats(campaign.id);
            } catch (statsErr) {
              this.log?.warn(
                "Failed to reconcile batches or recalculate campaign stats on status completion",
                {
                  campaignId: campaign.id,
                  error:
                    statsErr instanceof Error
                      ? statsErr.message
                      : String(statsErr),
                },
              );
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
            newKooiStatus: effectiveKooiStatus,
            isExpired,
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
