import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignNotFoundError } from "../../domain/errors/campaign.errors";

export class GetCampaignUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, campaignId: string) {
    const [campaign, overview] = await Promise.all([
      this.campaignRepo.findByIdWithRelations(tenantId, campaignId),
      this.campaignRepo.getCampaignOverviewStats(tenantId, campaignId),
    ]);

    if (!campaign) {
      throw new CampaignNotFoundError();
    }

    return {
      ...campaign,
      overview,
    };
  }
}
