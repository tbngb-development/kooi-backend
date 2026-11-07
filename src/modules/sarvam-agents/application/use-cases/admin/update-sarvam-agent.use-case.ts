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
import { ValidationError } from "../../../../../shared/errors/validation.error";
import type { Logger } from "../../../../../shared/logging/logger.interface";
import {
  validateConnectionConfigs,
  validateRetryConfig,
  validateSarvamAgentVariables,
} from "../../../domain/rules/sarvam-agent-config.rules";
import type {
  SarvamAgentVariable,
  SarvamConnectionConfig,
  SarvamRetryConfig,
  SarvamOutputVariable,
} from "../../../domain/types/sarvam-agent.types";

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
    let validatedVariables: SarvamAgentVariable[] | undefined = undefined;
    const effectiveVarKeys = new Set<string>();
    if (dto.agentVariables !== undefined) {
      validatedVariables = validateSarvamAgentVariables(dto.agentVariables);
      for (const v of validatedVariables) {
        effectiveVarKeys.add(v.key);
      }
    } else {
      const existingVars = this.mapper.parseAgentVariables(existing.agentVariables);
      for (const v of existingVars) {
        effectiveVarKeys.add(v.key);
      }
    }

    // Validate output variables if provided
    let validatedOutputVariables: SarvamOutputVariable[] | undefined = undefined;
    if (dto.outputVariables !== undefined) {
      const outNames = new Set<string>();
      validatedOutputVariables = [];
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
    }

    // Validate welcome message template
    if (
      dto.outputVariables !== undefined &&
      dto.goals === undefined &&
      existing.goals &&
      existing.goals.length > 0
    ) {
      for (const goal of existing.goals) {
        const outVar = validatedOutputVariables?.find(
          (v) => v.name.trim() === goal.outputVariableName.trim(),
        );
        if (
          !outVar ||
          outVar.type !== "enum" ||
          !outVar.options?.includes(goal.expectedValue)
        ) {
          throw new SarvamAgentInvalidOverrideError(
            `Cannot modify or remove output variable '${goal.outputVariableName}' because goal '${goal.displayName}' depends on it. Update or remove the goal first.`,
          );
        }
      }
    }

    let validatedWelcomeMessage = dto.welcomeMessage;
    if (validatedWelcomeMessage !== undefined) {
      if (
        validatedWelcomeMessage.customTemplate &&
        validatedWelcomeMessage.customTemplate.trim()
      ) {
        const matches =
          validatedWelcomeMessage.customTemplate.match(/\{\{([^}]+)\}\}/g) || [];
        const referencedKeys = matches.map((m) => m.slice(2, -2).trim());

        for (const refKey of referencedKeys) {
          if (!effectiveVarKeys.has(refKey)) {
            throw new SarvamAgentInvalidOverrideError(
              `Welcome message references undefined variable '{{${refKey}}}'. Please define it in agent variables first.`,
            );
          }
        }
        validatedWelcomeMessage.interpolationVariables = referencedKeys;
      }
    }

    // Validate connectionConfigs
    let validatedConnectionConfigs: SarvamConnectionConfig[] | undefined;
    if (dto.connectionConfigs !== undefined) {
      validatedConnectionConfigs = validateConnectionConfigs(
        dto.connectionConfigs,
      );
    } else {
      const existingConfigs = this.mapper.parseConnectionConfigs(
        existing.connectionConfigs,
      );
      if (existingConfigs.length === 0) {
        throw new ValidationError([
          {
            field: "connectionConfigs",
            message:
              "This agent currently has an incomplete configuration. At least one telephony connection configuration is required to update this agent.",
          },
        ]);
      }
    }

    // Validate retryConfig if provided
    let validatedRetryConfig: SarvamRetryConfig | undefined;
    if (dto.retryConfig !== undefined) {
      validatedRetryConfig = validateRetryConfig(dto.retryConfig);
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
      ...(validatedVariables !== undefined && {
        agentVariables: validatedVariables,
      }),
      ...(validatedWelcomeMessage !== undefined && {
        welcomeMessage: validatedWelcomeMessage,
      }),
      ...(validatedOutputVariables !== undefined && {
        outputVariables: validatedOutputVariables,
      }),
      ...(validatedConnectionConfigs !== undefined && {
        connectionConfigs: validatedConnectionConfigs,
      }),
      ...(validatedRetryConfig !== undefined && {
        retryConfig: validatedRetryConfig,
      }),
      ...(dto.allowedSchedule !== undefined && {
        allowedSchedule: dto.allowedSchedule,
      }),
      ...(dto.allowTenantVisible !== undefined && {
        allowTenantVisible: dto.allowTenantVisible,
      }),
      ...(dto.goals !== undefined && { goals: dto.goals }),
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
