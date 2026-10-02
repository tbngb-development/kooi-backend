import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { UpdatePlatformAgentDTO } from "../dto/platform-agent.dto";
import {
  PlatformAgentNotFoundError,
  DuplicatePlatformAgentSlugError,
} from "../../domain/errors/platform-agent.errors";

export class UpdatePlatformAgentUseCase {
  constructor(private readonly repository: PlatformAgentRepository) {}

  async execute(id: string, dto: UpdatePlatformAgentDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new PlatformAgentNotFoundError(id);
    }

    if (dto.slug && dto.slug !== existing.slug) {
      const collision = await this.repository.findBySlug(dto.slug);
      if (collision) {
        throw new DuplicatePlatformAgentSlugError(dto.slug);
      }
    }

    return this.repository.update(id, dto);
  }
}