import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export class DeletePlatformAgentUseCase {
  constructor(private readonly repository: PlatformAgentRepository) {}

  async execute(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new PlatformAgentNotFoundError(id);
    }
    await this.repository.delete(id);
  }
}