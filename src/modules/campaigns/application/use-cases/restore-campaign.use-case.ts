// modules/campaigns/application/use-cases/restore-campaign.use-case.ts

import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignEntity } from "../../domain/entities/campaign.entity";
import {
  CampaignNotFoundError,
  CampaignNotDeletedError,
} from "../../domain/errors/campaign.errors";
export class RestoreCampaignUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, campaignId: string): Promise<void> {
    const raw = await this.campaignRepo.findById(tenantId, campaignId, {
      includeDeleted: true,
    });
    if (!raw) throw new CampaignNotFoundError();

    const campaign = new CampaignEntity(raw);
    if (!campaign.isDeleted) throw new CampaignNotDeletedError();

    await this.campaignRepo.restore(tenantId, campaignId);
  }
}
