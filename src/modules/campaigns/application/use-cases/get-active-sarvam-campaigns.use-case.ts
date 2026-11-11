// modules/campaigns/application/use-cases/get-active-sarvam-campaigns.use-case.ts

import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import { CampaignSarvamAgentRequiredError } from "../../domain/errors/campaign.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface GetActiveSarvamCampaignsInput {
  tenantId: string;
  sarvamAgentId: string;
}

export class GetActiveSarvamCampaignsUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(input: GetActiveSarvamCampaignsInput): Promise<CampaignEntityData[]> {
    const { tenantId, sarvamAgentId } = input;

    if (!sarvamAgentId || sarvamAgentId.trim() === "") {
      throw new CampaignSarvamAgentRequiredError();
    }

    this.logger?.info("Fetching active Sarvam campaigns for agent", {
      action: "campaign.sarvam.get_active",
      tenantId,
      sarvamAgentId,
    });

    const campaigns = await this.campaignRepo.findActiveSarvamCampaignsForAgent(
      tenantId,
      sarvamAgentId,
    );

    this.logger?.info("Active Sarvam campaigns retrieved", {
      action: "campaign.sarvam.get_active.success",
      tenantId,
      sarvamAgentId,
      count: campaigns.length,
    });

    return campaigns;
  }
}

