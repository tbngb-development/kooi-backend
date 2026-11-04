import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { ISarvamApiKeyRepository } from "../../../../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type {
  CreateSarvamAgentDTO,
  SarvamAgentAdminResponseDTO,
} from "../../dto/sarvam-agent.dto";
import {
  SarvamAgentInvalidApiKeyError,
  SarvamAgentInactiveApiKeyError,
  SarvamAgentDuplicateAppIdError,
  SarvamAgentInvalidOverrideError,
} from "../../../domain/errors/sarvam-agent.errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class CreateSarvamAgentUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly apiKeyRepository: ISarvamApiKeyRepository,
    private readonly mapper: SarvamAgentMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: CreateSarvamAgentDTO,
  ): Promise<SarvamAgentAdminResponseDTO> {
    const apiKey = await this.apiKeyRepository.findById(dto.apiKeyId);
    if (!apiKey) {
      throw new SarvamAgentInvalidApiKeyError(dto.apiKeyId);
    }

    if (!apiKey.isActive) {
      throw new SarvamAgentInactiveApiKeyError(dto.apiKeyId);
    }

    const trimmedAppId = dto.appId.trim();
    const exists = await this.repository.existsForApiKeyAndAppId(
      dto.apiKeyId,
      trimmedAppId,
    );
    if (exists) {
      throw new SarvamAgentDuplicateAppIdError(dto.apiKeyId, trimmedAppId);
    }

    // Validate unique variable keys
    const agentVariables = dto.agentVariables ?? [];
    const varKeys = new Set<string>();
    for (const v of agentVariables) {
      const key = v.key.trim();
      if (!key) {
        throw new SarvamAgentInvalidOverrideError("Variable key cannot be empty.");
      }
      if (varKeys.has(key)) {
        throw new SarvamAgentInvalidOverrideError(
          `Duplicate variable key '${key}' defined in agent variables.`,
        );
      }
      varKeys.add(key);
    }

    // Validate unique output variable names
    const outputVariables = dto.outputVariables ?? [];
    const outNames = new Set<string>();
    for (const out of outputVariables) {
      const name = out.name.trim();
      if (!name) {
        throw new SarvamAgentInvalidOverrideError(
          "Output variable name cannot be empty.",
        );
      }
      if (outNames.has(name)) {
        throw new SarvamAgentInvalidOverrideError(
          `Duplicate output variable name '${name}' defined.`,
        );
      }
      outNames.add(name);
    }

    const created = await this.repository.create({
      name: dto.name.trim(),
      apiKeyId: dto.apiKeyId,
      appId: trimmedAppId,
      appVersion: Math.max(1, dto.appVersion),
      attemptsPerSecond: dto.attemptsPerSecond ?? null,
      webhookUrl: dto.webhookUrl?.trim() || null,
      agentVariables,
      welcomeMessage: dto.welcomeMessage ?? { defaultMessage: "" },
      outputVariables,
      allowTenantVisible: dto.allowTenantVisible ?? false,
      status: "ACTIVE",
      createdBy: dto.createdBy,
    });

    this.logger?.info("Created Sarvam Agent", {
      action: "sarvam_agent.created",
      agentId: created.id,
      name: created.name,
      apiKeyId: created.apiKeyId,
      appId: created.appId,
      createdBy: dto.createdBy,
    });

    return this.mapper.toAdminDTO(created);
  }
}
