import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import { type PlatformAgent } from "@prisma/client";
import { type UpdatePlatformAgentVariablesDto } from "../dto/platform-agent.dto";

export class UpdatePlatformAgentVariablesUseCase {
  constructor(private readonly agentRepository: PlatformAgentRepository) {}

  async execute(
    platformAgentId: string,
    dto: UpdatePlatformAgentVariablesDto,
  ): Promise<{ platformAgent: PlatformAgent | null }> {
    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    const updatedAgent = await this.agentRepository.updateAgentVariables(
      platformAgentId,
      {
        requiredVariables: dto.requiredVariables,
      },
    );
    return { platformAgent: updatedAgent };
  }
}
