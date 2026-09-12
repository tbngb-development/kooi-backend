import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { CreateCampaignInput } from "../dto/campaign.dto";
import {
  CampaignAssistantNotFoundError,
  BrochureNotConfirmedError,
} from "../../domain/errors/campaign.errors";

export class CreateCampaignUseCase {
  constructor(private readonly campaignRepo: CampaignRepository) {}

  async execute(tenantId: string, input: CreateCampaignInput) {
    const assistantExists = await this.campaignRepo.checkAssistantExists(
      tenantId,
      input.assistantId,
    );
    if (!assistantExists) {
      throw new CampaignAssistantNotFoundError();
    }

    if (input.brochureId) {
      const confirmed = await this.campaignRepo.checkBrochureConfirmed(
        tenantId,
        input.brochureId,
      );
      if (!confirmed) {
        throw new BrochureNotConfirmedError();
      }
    }

    return this.campaignRepo.create(tenantId, input);
  }
}
