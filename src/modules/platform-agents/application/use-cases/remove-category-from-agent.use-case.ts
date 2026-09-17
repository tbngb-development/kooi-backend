import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import {
  PlatformAgentNotFoundError,
} from "../../domain/errors/platform-agent.errors";

export class RemoveCategoryFromAgentUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
  ) {}

  async execute(
    platformAgentId: string,
    categoryId: string,
  ): Promise<void> {
    // 1. Verify platform agent exists
    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    // 2. Remove (no-op if not assigned — deleteMany is safe)
    await this.agentRepository.removeCategoryFromAgent(
      platformAgentId,
      categoryId,
    );
  }
}