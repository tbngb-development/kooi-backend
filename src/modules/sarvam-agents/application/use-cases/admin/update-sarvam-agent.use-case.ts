import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type {
  UpdateSarvamAgentDTO,
  SarvamAgentAdminResponseDTO,
} from "../../dto/sarvam-agent.dto";
import {
  SarvamAgentNotFoundError,
  SarvamAgentDuplicateAppIdError,
  SarvamAgentInvalidOverrideError,
} from "../../../domain/errors/sarvam-agent.errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class UpdateSarvamAgentUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly mapper: SarvamAgentMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: UpdateSarvamAgentDTO,
  ): Promise<SarvamAgentAdminResponseDTO> {
    const existing = await this.repository.findById(dto.id);
    if (!existing) {
      throw new SarvamAgentNotFoundError(dto.id);
    }

    if (dto.appId !== undefined) {
      const trimmedAppId = dto.appId.trim();
      if (!trimmedAppId) {
        throw new SarvamAgentInvalidOverrideError("appId cannot be empty.");
      }
      const duplicateExists = await this.repository.existsForApiKeyAndAppId(
        existing.apiKeyId,
        trimmedAppId,
        existing.id,
      );
      if (duplicateExists) {
        throw new SarvamAgentDuplicateAppIdError(
          existing.apiKeyId,
          trimmedAppId,
        );
      }
    }

    // Validate variables if provided
    if (dto.agentVariables !== undefined) {
      const varKeys = new Set<string>();
      for (const v of dto.agentVariables) {
        const key = v.key.trim();
        if (!key) {
          throw new SarvamAgentInvalidOverrideError(
            "Variable key cannot be empty.",
          );
        }
        if (varKeys.has(key)) {
          throw new SarvamAgentInvalidOverrideError(
            `Duplicate variable key '${key}' defined in agent variables.`,
          );
        }
        varKeys.add(key);
      }
    }

    // Validate output variables if provided
    if (dto.outputVariables !== undefined) {
      const outNames = new Set<string>();
      for (const out of dto.outputVariables) {
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
    }

    const updated = await this.repository.update(dto.id, {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.appId !== undefined && { appId: dto.appId.trim() }),
      ...(dto.appVersion !== undefined && {
        appVersion: Math.max(1, dto.appVersion),
      }),
      ...(dto.attemptsPerSecond !== undefined && {
        attemptsPerSecond: dto.attemptsPerSecond,
      }),
      ...(dto.webhookUrl !== undefined && {
        webhookUrl: dto.webhookUrl?.trim() || null,
      }),
      ...(dto.agentVariables !== undefined && {
        agentVariables: dto.agentVariables,
      }),
      ...(dto.welcomeMessage !== undefined && {
        welcomeMessage: dto.welcomeMessage,
      }),
      ...(dto.outputVariables !== undefined && {
        outputVariables: dto.outputVariables,
      }),
      ...(dto.allowTenantVisible !== undefined && {
        allowTenantVisible: dto.allowTenantVisible,
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    });

    this.logger?.info("Updated Sarvam Agent", {
      action: "sarvam_agent.updated",
      agentId: updated.id,
      updatedBy: dto.updatedBy,
    });

    return this.mapper.toAdminDTO(updated);
  }
}
