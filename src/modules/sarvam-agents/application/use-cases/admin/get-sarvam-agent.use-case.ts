import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type { SarvamAgentAdminResponseDTO } from "../../dto/sarvam-agent.dto";
import { SarvamAgentNotFoundError } from "../../../domain/errors/sarvam-agent.errors";

export class GetSarvamAgentUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly mapper: SarvamAgentMapper,
  ) {}

  async execute(id: string): Promise<SarvamAgentAdminResponseDTO> {
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      throw new SarvamAgentNotFoundError(id);
    }

    const agent = await this.repository.findById(id.trim());
    if (!agent) {
      throw new SarvamAgentNotFoundError(id);
    }

    return this.mapper.toAdminDTO(agent);
  }
}

