import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ListPlatformAgentsFilters } from "../dto/platform-agent.dto";

export class ListPlatformAgentsUseCase {
  constructor(private readonly repository: PlatformAgentRepository) {}

  async execute(filters: ListPlatformAgentsFilters) {
    return this.repository.list(filters);
  }
}