import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export class GetPlatformAgentUseCase {
  constructor(private readonly repository: PlatformAgentRepository) {}

  async execute(id: string) {
    const agent = await this.repository.findById(id);
    if (!agent) {
      throw new PlatformAgentNotFoundError(id);
    }
    return agent;
  }
}