import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import { CampaignNotFoundError } from "../../domain/errors/campaign.errors";

export class GetCampaignPerformanceUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, campaignId: string, batchId?: string) {
    const perf = await this.campaignRepo.getPerformance(
      tenantId,
      campaignId,
      batchId,
    );
    if (!perf) throw new CampaignNotFoundError();
    return perf;
  }
}
