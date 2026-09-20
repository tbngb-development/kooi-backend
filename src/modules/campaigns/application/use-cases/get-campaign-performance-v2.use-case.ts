import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { CampaignPerformanceV2Result } from "../dto/campaign.dto";
import { CampaignNotFoundError } from "../../domain/errors/campaign.errors";

export class GetCampaignPerformanceV2UseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId?: string,
  ): Promise<CampaignPerformanceV2Result> {
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) throw new CampaignNotFoundError();

    return this.campaignRepo.getPerformanceV2(tenantId, campaignId, batchId);
  }
}
