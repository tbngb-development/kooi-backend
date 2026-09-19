import { type AssistantRepository } from "../interfaces/assistant-repository.interface";
import { AssistantNotFoundError } from "../../domain/errors/assistant.errors";
import { type GetAssistantOutput } from "../dto/assistant.dto";
import { extractPromptInputFields } from "../../infrastructure/promptVariableExtractor";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";

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

    const variables = this.resolveVariables(assistant.platformAgent);

    return {
      assistant,
      variables,
    };
  }

  private resolveVariables(platformAgent: {
    systemPrompt: string | null;
    welcomeMessage: string | null;
    requiredVariables: RequiredVariable[] | null; // Typed cleanly matching the repository interface
  }): GetAssistantOutput["variables"] {
    const stored = platformAgent.requiredVariables;

    if (stored && stored.length > 0) {
      return stored.map((v) => ({
        key: v.name,
        label: v.label,
        required: v.required,
        isEditable: v.isEditable,
      }));
    }

    // Legacy fallback: extract from prompt, mark all as required + editable
    const systemPrompt = platformAgent.systemPrompt ?? "";
    const welcomeMessage = platformAgent.welcomeMessage ?? "";
    const extracted = extractPromptInputFields(systemPrompt, welcomeMessage);

    return extracted.map((v) => ({
      key: v.key,
      label: v.label,
      required: true,
      isEditable: true,
    }));
  }
}
