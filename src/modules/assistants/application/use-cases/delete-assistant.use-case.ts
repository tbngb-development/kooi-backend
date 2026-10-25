import { type AssistantRepository } from "../interfaces/assistant-repository.interface";
import {
  AssistantNotFoundError,
  AssistantInUseError,
} from "../../domain/errors/assistant.errors";

export class DeleteAssistantUseCase {
  constructor(private readonly assistantRepo: AssistantRepository) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const assistant = await this.assistantRepo.findById(tenantId, id);
    if (!assistant) throw new AssistantNotFoundError();

    const activeCampaignCount = await this.assistantRepo.countActiveCampaigns(
      tenantId,
      id,
    );
    if (activeCampaignCount > 0) {
      throw new AssistantInUseError(activeCampaignCount);
    }

    await this.assistantRepo.softDelete(tenantId, id);
  }
}

