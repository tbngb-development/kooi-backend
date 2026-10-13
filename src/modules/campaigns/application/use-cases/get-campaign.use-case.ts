import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignNotFoundError } from "../../domain/errors/campaign.errors";

export class GetCampaignUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, campaignId: string) {
    const campaign = await this.campaignRepo.findByIdWithRelations(
      tenantId,
      campaignId,
    );

    if (!campaign) {
      throw new CampaignNotFoundError();
    }

    const overview = await this.campaignRepo.getCampaignOverviewStats(
      tenantId,
      campaignId,
    );

    return {
      ...campaign,
      overview,
    };
  }
}
