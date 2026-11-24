import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type { SarvamAgentAdminResponseDTO } from "../../dto/sarvam-agent.dto";
import { SarvamAgentNotFoundError } from "../../../domain/errors/sarvam-agent.errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class ArchiveSarvamAgentUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly mapper: SarvamAgentMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    id: string,
    archivedBy?: string,
  ): Promise<SarvamAgentAdminResponseDTO> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new SarvamAgentNotFoundError(id);
    }

    const archived = await this.repository.archive(id);

    this.logger?.info("Archived Sarvam Agent", {
      action: "sarvam_agent.archived",
      agentId: id,
      archivedBy,
    });

    return this.mapper.toAdminDTO(archived);
  }
}
