import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignNotFoundError } from "../../domain/errors/campaign.errors";

export class GetCampaignStatsUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, campaignId: string) {
    const stats = await this.campaignRepo.getStats(tenantId, campaignId);
    if (!stats) throw new CampaignNotFoundError();
    return stats;
  }
}
