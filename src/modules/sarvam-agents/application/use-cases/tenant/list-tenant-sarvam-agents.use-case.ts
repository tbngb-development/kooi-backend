import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type { TenantSarvamAgentSummaryDTO } from "../../dto/sarvam-agent.dto";

export class ListTenantSarvamAgentsUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly mapper: SarvamAgentMapper,
  ) {}

  async execute(tenantId: string): Promise<TenantSarvamAgentSummaryDTO[]> {
    if (!tenantId || typeof tenantId !== "string" || tenantId.trim().length === 0) {
      return [];
    }

    const agents = await this.repository.listAccessibleForTenant(tenantId.trim());

    return agents.map((agent) => this.mapper.toTenantSummaryDTO(agent));
  }
}

