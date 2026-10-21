import { type AssistantRepository } from "../interfaces/assistant-repository.interface";
import { type UpdateAssistantInput } from "../dto/assistant.dto";
import { AssistantNotFoundError } from "../../domain/errors/assistant.errors";
import { type AssistantEntityData } from "../../domain/entities/assistant.entity";
import { validateAssistantVariables } from "../../domain/rules/assistant-variable.rules";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";

export class UpdateAssistantUseCase {
  constructor(private readonly assistantRepo: AssistantRepository) {}

  async execute(input: UpdateAssistantInput): Promise<AssistantEntityData> {
    const assistantWithAgent =
      await this.assistantRepo.findByIdWithPlatformAgent(
        input.tenantId,
        input.id,
      );
    if (!assistantWithAgent) {
      throw new AssistantNotFoundError();
    }

    let cleanedVariables = undefined;
    if (input.variables !== undefined) {
      cleanedVariables = validateAssistantVariables(
        assistantWithAgent.platformAgent.type,
        assistantWithAgent.platformAgent.requiredVariables as RequiredVariable[] | null,
        input.variables,
      );
    }

    return this.assistantRepo.update(input.tenantId, input.id, {
      name: input.name,
      variables: cleanedVariables,
    });
  }
}