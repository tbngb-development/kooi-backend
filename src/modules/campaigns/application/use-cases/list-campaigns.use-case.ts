import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type {
  ListCampaignsFilters,
  PaginatedCampaignsResult,
} from "../dto/campaign.dto";

export class ListCampaignsUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  execute(
    filters: ListCampaignsFilters & { tenantId: string },
  ): Promise<PaginatedCampaignsResult> {
    const { tenantId, ...rest } = filters;
    return this.campaignRepo.list(tenantId, rest);
  }
}
