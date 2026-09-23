import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type {
  ExtractionOverviewInput,
  ExtractionOverviewResult,
} from "../dto/campaign.dto";

export class GetCampaignExtractionOverviewUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(
    input: ExtractionOverviewInput,
  ): Promise<ExtractionOverviewResult> {
    return this.campaignRepo.getExtractionOverview(
      input.tenantId,
      input.campaignId,
      input.batchId,
    );
  }
}
