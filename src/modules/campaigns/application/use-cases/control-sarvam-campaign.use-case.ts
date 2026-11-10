// modules/campaigns/application/use-cases/control-sarvam-campaign.use-case.ts

import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../../batches/application/interfaces/batch-repository.interface";
import type { ISarvamCampaignClient } from "../../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  CampaignNotFoundError,
  SarvamAgentMaxActiveCampaignsError,
} from "../../domain/errors/campaign.errors";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import { mapSarvamCampaignStatusToKooi } from "../../domain/rules/sarvam-status-mapper";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";

export interface ControlSarvamCampaignInput {
  tenantId: string;
  campaignId: string;
  action: "pause" | "resume" | "cancel";
}

export class ControlSarvamCampaignUseCase {
  private readonly log?: Logger;

  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly batchRepo: BatchRepository,
    private readonly sarvamCampaignClient: ISarvamCampaignClient,
    private readonly sarvamEncryptionService: ISarvamApiKeyEncryptionService,
    logger?: Logger,
  ) {
    this.log = logger?.child({ component: "ControlSarvamCampaignUseCase" });
  }

  async execute(input: ControlSarvamCampaignInput): Promise<CampaignEntityData> {
    const { tenantId, campaignId, action } = input;

    // 1. Verify campaign exists under tenant
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError();
    }

    // 2. Validate provider is SARVAM
    if (campaign.provider !== "SARVAM") {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Campaign is not configured with Sarvam voice provider",
        "INVALID_VOICE_PROVIDER",
      );
    }

    if (!campaign.sarvamCampaignId || !campaign.sarvamAgentId) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Campaign is missing external Sarvam identifiers",
        "MISSING_SARVAM_METADATA",
      );
    }

    // 3. Resolve Sarvam Agent credentials
    const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
      tenantId,
      campaign.sarvamAgentId,
    );

    if (!sarvamAgent || !sarvamAgent.apiKey) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Sarvam agent credentials could not be resolved",
        "SARVAM_CREDENTIALS_NOT_FOUND",
      );
    }

    const apiKey = this.sarvamEncryptionService.decrypt(
      sarvamAgent.apiKey.apiKeyEncrypted,
    );

    // 3.5 Validate active campaign capacity (max 5 running campaigns per Sarvam agent)
    if (action === "resume" && campaign.status !== "RUNNING") {
      const activeCount = this.campaignRepo.countActiveCampaignsForAgent
        ? await this.campaignRepo.countActiveCampaignsForAgent(
            campaign.sarvamAgentId,
            campaign.id,
          )
        : 0;
      if (activeCount >= 5) {
        throw new SarvamAgentMaxActiveCampaignsError(sarvamAgent.name);
      }
    }

    // 4. Send action to Sarvam upstream API
    this.log?.info("Dispatching campaign control action to Sarvam", {
      action: "sarvam.campaign_control.dispatch",
      campaignId,
      sarvamCampaignId: campaign.sarvamCampaignId,
      requestedAction: action,
    });

    const sarvamResponse = await this.sarvamCampaignClient.updateStatus(
      sarvamAgent.apiKey.organizationId,
      sarvamAgent.apiKey.workspaceId,
      campaign.sarvamCampaignId,
      apiKey,
      action,
    );

    // 5. Map upstream status to Kooi status
    const mappedStatus = mapSarvamCampaignStatusToKooi(sarvamResponse.status);
    const isCancelled = action === "cancel" || mappedStatus === "CANCELLED";
    const extra = isCancelled ? { completedAt: new Date() } : undefined;

    // 6. Update local campaign state
    const updated = await this.campaignRepo.updateSarvamStatus(
      campaignId,
      sarvamResponse.status,
      mappedStatus,
      extra,
    );

    // 7. Cascade to active batches if campaign was cancelled
    if (isCancelled) {
      try {
        await this.batchRepo.cascadeStatusFromCampaign(campaignId, "STOPPED");
      } catch (cascadeErr) {
        this.log?.warn("Failed to cascade STOPPED status to batches on campaign cancellation", {
          campaignId,
          error: cascadeErr instanceof Error ? cascadeErr.message : String(cascadeErr),
        });
      }
    }

    // 8. Ensure stats are synchronized
    try {
      await this.batchRepo.recalculateCampaignStats(campaignId);
    } catch (statsErr) {
      this.log?.warn("Failed to recalculate campaign stats after control action", {
        campaignId,
        error: statsErr instanceof Error ? statsErr.message : String(statsErr),
      });
    }

    this.log?.info("Campaign control action executed successfully", {
      action: "sarvam.campaign_control.success",
      campaignId,
      sarvamCampaignId: campaign.sarvamCampaignId,
      controlAction: action,
      sarvamStatus: sarvamResponse.status,
      newKooiStatus: mappedStatus,
    });

    return updated;
  }
}
