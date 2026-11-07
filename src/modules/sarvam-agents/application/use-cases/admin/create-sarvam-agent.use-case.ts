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
import { ValidationError } from "../../../../../shared/errors/validation.error";
import type { Logger } from "../../../../../shared/logging/logger.interface";
import type {
  SarvamConnectionConfig,
  SarvamRetryConfig,
  SarvamOutputVariable,
} from "../../../domain/types/sarvam-agent.types";
import {
  validateConnectionConfigs,
  validateRetryConfig,
  validateSarvamAgentVariables,
} from "../../../domain/rules/sarvam-agent-config.rules";

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

    // Validate variable definitions
    const agentVariables = validateSarvamAgentVariables(dto.agentVariables);
    const varKeys = new Set<string>(agentVariables.map((v) => v.key));

    // Validate unique output variable names & enum options
    const outputVariables = dto.outputVariables ?? [];
    const outNames = new Set<string>();
    const validatedOutputVariables: SarvamOutputVariable[] = [];

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

      const type = out.type === "enum" ? "enum" : "string";
      let options: string[] | undefined = undefined;

      if (type === "enum") {
        const rawOptions = Array.isArray(out.options) ? out.options : [];
        const cleanOptions = rawOptions
          .map((o) => String(o).trim())
          .filter(Boolean);

        if (cleanOptions.length === 0) {
          throw new SarvamAgentInvalidOverrideError(
            `Enum output variable '${name}' must have at least one valid option.`,
          );
        }

        const uniqueOptions = new Set(cleanOptions.map((o) => o.toLowerCase()));
        if (uniqueOptions.size !== cleanOptions.length) {
          throw new SarvamAgentInvalidOverrideError(
            `Enum output variable '${name}' has duplicate options.`,
          );
        }
        options = cleanOptions;
      }

      validatedOutputVariables.push({
        name,
        description: out.description.trim(),
        type,
        options: options ?? [],
      });
    }

    // Validate welcome message template interpolation variables
    const welcomeMessage = dto.welcomeMessage ?? { defaultMessage: "" };
    if (welcomeMessage.customTemplate && welcomeMessage.customTemplate.trim()) {
      const matches =
        welcomeMessage.customTemplate.match(/\{\{([^}]+)\}\}/g) || [];
      const referencedKeys = matches.map((m) => m.slice(2, -2).trim());

      for (const refKey of referencedKeys) {
        if (!varKeys.has(refKey)) {
          throw new SarvamAgentInvalidOverrideError(
            `Welcome message references undefined variable '{{${refKey}}}'. Please define it in agent variables first.`,
          );
        }
      }
      welcomeMessage.interpolationVariables = referencedKeys;
    }

    const connectionConfigs = validateConnectionConfigs(dto.connectionConfigs);
    const retryConfig = validateRetryConfig(dto.retryConfig);

    const created = await this.repository.create({
      name: dto.name.trim(),
      apiKeyId: dto.apiKeyId,
      appId: trimmedAppId,
      appVersion: Math.max(1, dto.appVersion),
      attemptsPerSecond: dto.attemptsPerSecond ?? null,
      agentVariables,
      welcomeMessage,
      outputVariables: validatedOutputVariables,
      connectionConfigs,
      retryConfig,
      allowedSchedule: dto.allowedSchedule,
      allowTenantVisible: dto.allowTenantVisible ?? false,
      goals: dto.goals ?? [],
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
