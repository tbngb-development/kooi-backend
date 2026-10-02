import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { AgentExtractionConfig } from "../interfaces/platform-agent-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export class GetAgentExtractionsUseCase {
  constructor(private readonly agentRepository: PlatformAgentRepository) {}

  async execute(platformAgentId: string): Promise<AgentExtractionConfig> {
    const config =
      await this.agentRepository.getAgentExtractionConfig(platformAgentId);
    if (!config) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }
    return config;
  }
}
