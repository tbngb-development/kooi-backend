import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { ISarvamAgentOverrideRepository } from "../../interfaces/sarvam-agent-override-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type {
  UpdateTenantWelcomeMessageDTO,
  TenantSarvamAgentDetailDTO,
} from "../../dto/sarvam-agent.dto";
import { SarvamAgentNotFoundError } from "../../../domain/errors/sarvam-agent.errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class UpdateTenantSarvamAgentWelcomeMessageUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly overrideRepository: ISarvamAgentOverrideRepository,
    private readonly mapper: SarvamAgentMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    agentId: string,
    tenantId: string,
    dto: UpdateTenantWelcomeMessageDTO,
  ): Promise<TenantSarvamAgentDetailDTO> {
    const agent = await this.repository.findAccessibleForTenant(
      agentId,
      tenantId,
    );
    if (!agent) {
      throw new SarvamAgentNotFoundError(agentId);
    }

    const customMessage =
      dto.customMessage !== null && dto.customMessage !== undefined
        ? dto.customMessage.trim()
        : null;

    const savedOverride = await this.overrideRepository.upsertWelcomeMessage(
      agentId,
      tenantId,
      customMessage,
    );

    this.logger?.info("Updated tenant Sarvam agent welcome message", {
      action: "sarvam_agent_tenant.welcome_message_updated",
      agentId,
      tenantId,
      isCustom: customMessage !== null,
    });

    return this.mapper.toTenantDetailDTO(agent, savedOverride);
  }
}
