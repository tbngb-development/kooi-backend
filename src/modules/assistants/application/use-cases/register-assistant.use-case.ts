import { type AssistantRepository } from "../interfaces/assistant-repository.interface";
import { type RegisterAssistantInput } from "../dto/assistant.dto";
import { type PlatformAgentRepository } from "../../../platform-agents/application/interfaces/platform-agent-repository.interface";
import { type BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import { PlatformAgentNotFoundError } from "../../../platform-agents/domain/errors/platform-agent.errors";
import {
  PlatformAgentNotActiveError,
  PlatformAgentDedicatedError,
  ApiKeyMismatchError,
  PlatformAgentAlreadyAssignedError,
} from "../../domain/errors/assistant.errors";
import { type AssistantEntityData } from "../../domain/entities/assistant.entity";

export class RegisterAssistantUseCase {
  constructor(
    private readonly assistantRepo: AssistantRepository,
    private readonly platformAgentRepo: PlatformAgentRepository,
    private readonly apiKeyRepo: BolnaApiKeyRepository,
  ) {}

  async execute(input: RegisterAssistantInput): Promise<AssistantEntityData> {
    // 1. Fetch template platform agent
    const platformAgent = await this.platformAgentRepo.findById(
      input.platformAgentId,
    );
    if (!platformAgent) {
      throw new PlatformAgentNotFoundError(input.platformAgentId);
    }
    if (!platformAgent.isActive) {
      throw new PlatformAgentNotActiveError(input.platformAgentId);
    }

    // 2. Fetch active Bolna API key configuration for the Tenant
    const tenantKey = await this.apiKeyRepo.findKeyForTenant(input.tenantId);
    if (!tenantKey || !tenantKey.isActive) {
      throw new ApiKeyMismatchError();
    }

    // 3. Match keys for isolated platform calling environment compatibility
    if (platformAgent.bolnaApiKeyId !== tenantKey.id) {
      throw new ApiKeyMismatchError();
    }

    // 4. Enforce isFeatured template constraint: Single tenant occupancy check
    if (platformAgent.isFeatured) {
      const occupiedBy = await this.assistantRepo.findByPlatformAgentId(
        null,
        input.platformAgentId,
      );
      if (occupiedBy && occupiedBy.tenantId !== input.tenantId) {
        throw new PlatformAgentDedicatedError(input.platformAgentId);
      }
    }

    // 5. Deduplicate template assignment for the tenant workspace
    const existing = await this.assistantRepo.findByPlatformAgentId(
      input.tenantId,
      input.platformAgentId,
    );
    if (existing) {
      throw new PlatformAgentAlreadyAssignedError(
        input.platformAgentId,
        input.tenantId,
      );
    }

    return this.assistantRepo.create(input.tenantId, {
      platformAgentId: input.platformAgentId,
      name: input.name,
      config: platformAgent.defaultConfig as Record<string, unknown>,
    });
  }
}
