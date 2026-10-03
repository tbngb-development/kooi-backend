
import type { AssistantRepository } from "../interfaces/assistant-repository.interface";
import { AssistantNotFoundError, AssistantNotDeletedError } from "../../domain/errors/assistant.errors";

export class RestoreAssistantUseCase {
  constructor(private readonly assistantRepo: AssistantRepository) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const assistant = await this.assistantRepo.findById(tenantId, id, { includeDeleted: true });
    if (!assistant) throw new AssistantNotFoundError();
    if (!assistant.isDeleted) throw new AssistantNotDeletedError();

    await this.assistantRepo.restore(tenantId, id);
  }
}