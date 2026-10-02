import { type AssistantRepository } from "../interfaces/assistant-repository.interface";
import { type AssistantEntityData } from "../../domain/entities/assistant.entity";

export class ListAssistantsUseCase {
  constructor(private readonly assistantRepo: AssistantRepository) {}

  async execute(tenantId: string): Promise<AssistantEntityData[]> {
    return this.assistantRepo.list(tenantId);
  }
}