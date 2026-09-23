import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type {
  ExtractionInsightInput,
  ExtractionInsightResult,
} from "../dto/campaign.dto";

export class GetCampaignExtractionInsightsUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(
    input: ExtractionInsightInput,
  ): Promise<ExtractionInsightResult> {
    return this.campaignRepo.getExtractionInsights(
      input.tenantId,
      input.campaignId,
      input.batchId,
      input.topN,
    );
  }
}
