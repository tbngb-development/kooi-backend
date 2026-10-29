import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import {
  PlatformAgentNotFoundError,
  PlatformAgentVariableNotFoundError,
  PlatformAgentVariableMismatchError,
} from "../../domain/errors/platform-agent.errors";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";
import type { UpdatePlatformAgentIndividualVariableDTO } from "../dto/platform-agent.dto";

export class UpdatePlatformAgentVariableUseCase {
  constructor(private readonly agentRepository: PlatformAgentRepository) {}

  async execute(
    platformAgentId: string,
    variableName: string,
    dto: UpdatePlatformAgentIndividualVariableDTO,
  ): Promise<{ variable: RequiredVariable }> {
    if (dto.name !== undefined && dto.name !== variableName) {
      throw new PlatformAgentVariableMismatchError(dto.name, variableName);
    }

    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    const currentVariables: RequiredVariable[] = Array.isArray(
      agent.requiredVariables,
    )
      ? (agent.requiredVariables as unknown as RequiredVariable[])
      : [];

    const targetIndex = currentVariables.findIndex(
      (v) => v.name === variableName,
    );

    if (targetIndex === -1) {
      throw new PlatformAgentVariableNotFoundError(
        variableName,
        platformAgentId,
      );
    }

    const existingVar = currentVariables[targetIndex];
    const updatedVariable: RequiredVariable = {
      ...existingVar,
      ...(dto.label !== undefined && { label: dto.label }),
      ...(dto.required !== undefined && { required: dto.required }),
      ...(dto.isEditable !== undefined && { isEditable: dto.isEditable }),
      ...(dto.inputType !== undefined && { inputType: dto.inputType }),
      ...(dto.defaultValue !== undefined && {
        defaultValue:
          dto.defaultValue && dto.defaultValue.trim() !== ""
            ? dto.defaultValue.trim()
            : null,
      }),
    };

    const updatedVariables = [...currentVariables];
    updatedVariables[targetIndex] = updatedVariable;

    await this.agentRepository.updateAgentVariables(platformAgentId, {
      requiredVariables: updatedVariables,
    });

    return { variable: updatedVariable };
  }
}

