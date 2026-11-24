// modules/campaigns/application/use-cases/archive-campaign.use-case.ts

import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignEntity } from "../../domain/entities/campaign.entity";
import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  CampaignNotArchivableError,
} from "../../domain/errors/campaign.errors";
import type { ControlSarvamCampaignUseCase } from "./control-sarvam-campaign.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ArchiveCampaignUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly controlSarvamCampaignUseCase?: ControlSarvamCampaignUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(tenantId: string, campaignId: string): Promise<void> {
    const raw = await this.campaignRepo.findById(tenantId, campaignId);
    if (!raw) throw new CampaignNotFoundError();

    const campaign = new CampaignEntity(raw);
    if (campaign.isDeleted) throw new CampaignAlreadyDeletedError();
    if (!campaign.isArchivable)
      throw new CampaignNotArchivableError(campaign.status);

    // If active or draft Sarvam campaign, cancel upstream on Sarvam AI to free concurrency slot
    if (
      campaign.provider === "SARVAM" &&
      campaign.sarvamCampaignId &&
      campaign.status !== "CANCELLED" &&
      campaign.status !== "COMPLETED" &&
      this.controlSarvamCampaignUseCase
    ) {
      try {
        await this.controlSarvamCampaignUseCase.execute({
          tenantId,
          campaignId,
          action: "cancel",
        });
        this.logger?.info("Upstream Sarvam campaign cancelled as part of archive", {
          action: "campaign.archive.sarvam_cancelled",
          tenantId,
          campaignId,
          sarvamCampaignId: campaign.sarvamCampaignId,
        });
      } catch (err) {
        this.logger?.warn("Failed to cancel upstream Sarvam campaign during archive", {
          action: "campaign.archive.sarvam_cancel_failed",
          tenantId,
          campaignId,
          sarvamCampaignId: campaign.sarvamCampaignId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.campaignRepo.softDelete(tenantId, campaignId);
  }
}
