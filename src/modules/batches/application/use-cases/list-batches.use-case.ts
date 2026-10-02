import type { BatchRepository } from "../interfaces/batch-repository.interface";
import { CampaignNotFoundError } from "../../../campaigns/domain/errors/campaign.errors";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";

export class ListBatchesUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo: CampaignRepository,
  ) {}

  async execute(tenantId: string, campaignId: string) {
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) throw new CampaignNotFoundError();

    return this.batchRepo.list(tenantId, campaignId);
  }
}
