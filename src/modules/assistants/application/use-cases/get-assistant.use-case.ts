import { type AssistantRepository } from "../interfaces/assistant-repository.interface";
import { AssistantNotFoundError } from "../../domain/errors/assistant.errors";
import { type GetAssistantOutput } from "../dto/assistant.dto";
import { extractPromptInputFields } from "../../infrastructure/promptVariableExtractor";

export class GetAssistantUseCase {
  constructor(private readonly assistantRepo: AssistantRepository) {}

  async execute(tenantId: string, id: string): Promise<GetAssistantOutput> {
    const assistant = await this.assistantRepo.findByIdWithPlatformAgent(
      tenantId,
      id,
    );
    if (!assistant) {
      throw new AssistantNotFoundError();
    }

    const systemPrompt = assistant.platformAgent.systemPrompt ?? "";
    const variables = extractPromptInputFields(systemPrompt, "");

    return {
      assistant,
      variables,
    };
  }
}
