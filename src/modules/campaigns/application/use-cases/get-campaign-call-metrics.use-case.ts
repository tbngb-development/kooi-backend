import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type {
  CampaignCallMetricsInput,
  CampaignCallMetricsResult,
} from "../dto/campaign.dto";

export class GetCampaignCallMetricsUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(
    input: CampaignCallMetricsInput,
  ): Promise<CampaignCallMetricsResult> {
    return this.campaignRepo.getCampaignCallMetrics(
      input.tenantId,
      input.campaignId,
      input.batchId,
    );
  }
}
