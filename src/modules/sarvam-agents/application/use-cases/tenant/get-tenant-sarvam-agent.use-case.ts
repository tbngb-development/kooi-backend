import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { ISarvamAgentOverrideRepository } from "../../interfaces/sarvam-agent-override-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type { TenantSarvamAgentDetailDTO } from "../../dto/sarvam-agent.dto";
import { SarvamAgentNotFoundError } from "../../../domain/errors/sarvam-agent.errors";

export class GetTenantSarvamAgentUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly overrideRepository: ISarvamAgentOverrideRepository,
    private readonly mapper: SarvamAgentMapper,
  ) {}

  async execute(
    agentId: string,
    tenantId: string,
  ): Promise<TenantSarvamAgentDetailDTO> {
    const agent = await this.repository.findAccessibleForTenant(
      agentId,
      tenantId,
    );
    if (!agent) {
      throw new SarvamAgentNotFoundError(agentId);
    }

    const override = await this.overrideRepository.findByAgentAndTenant(
      agentId,
      tenantId,
    );

    return this.mapper.toTenantDetailDTO(agent, override);
  }
}

