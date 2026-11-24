import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type {
  CampaignGoalMetricsInput,
  CampaignGoalMetricsResult,
} from "../dto/campaign.dto";

export class GetCampaignGoalMetricsUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(
    input: CampaignGoalMetricsInput,
  ): Promise<CampaignGoalMetricsResult> {
    return this.campaignRepo.getCampaignGoalMetrics(
      input.tenantId,
      input.campaignId,
      input.batchId,
    );
  }
}

