// modules/campaigns/application/use-cases/archive-campaign.use-case.ts

import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignEntity } from "../../domain/entities/campaign.entity";
import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  CampaignNotArchivableError,
} from "../../domain/errors/campaign.errors";

export class ArchiveCampaignUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, campaignId: string): Promise<void> {
    const raw = await this.campaignRepo.findById(tenantId, campaignId, {
      includeDeleted: true,
    });
    if (!raw) throw new CampaignNotFoundError();

    const campaign = new CampaignEntity(raw);
    if (campaign.isDeleted) throw new CampaignAlreadyDeletedError();
    if (!campaign.isArchivable)
      throw new CampaignNotArchivableError(campaign.status);

    await this.campaignRepo.softDelete(tenantId, campaignId);
  }
}
