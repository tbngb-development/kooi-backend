import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { ISarvamApiKeyRepository } from "../../../../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type {
  UpdateSarvamAgentDTO,
  SarvamAgentAdminResponseDTO,
} from "../../dto/sarvam-agent.dto";
import {
  SarvamAgentNotFoundError,
  SarvamAgentDuplicateAppIdError,
  SarvamAgentInvalidOverrideError,
  SarvamAgentInvalidApiKeyError,
  SarvamAgentInactiveApiKeyError,
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
    private readonly apiKeyRepository: ISarvamApiKeyRepository,
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

    const isApiKeyChanged =
      dto.apiKeyId !== undefined &&
      dto.apiKeyId.trim() !== "" &&
      dto.apiKeyId !== existing.apiKeyId;

    const targetApiKeyId = isApiKeyChanged ? dto.apiKeyId! : existing.apiKeyId;

    if (isApiKeyChanged) {
      const apiKey = await this.apiKeyRepository.findById(targetApiKeyId);
      if (!apiKey) {
        throw new SarvamAgentInvalidApiKeyError(targetApiKeyId);
      }
      if (!apiKey.isActive) {
        throw new SarvamAgentInactiveApiKeyError(targetApiKeyId);
      }
    }

    const effectiveAppId =
      dto.appId !== undefined ? dto.appId.trim() : existing.appId;
    if (!effectiveAppId) {
      throw new SarvamAgentInvalidOverrideError("appId cannot be empty.");
    }

    if (isApiKeyChanged || dto.appId !== undefined) {
      const duplicateExists = await this.repository.existsForApiKeyAndAppId(
        targetApiKeyId,
        effectiveAppId,
        isApiKeyChanged ? undefined : existing.id,
      );
      if (duplicateExists) {
        throw new SarvamAgentDuplicateAppIdError(
          targetApiKeyId,
          effectiveAppId,
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

    if (isApiKeyChanged) {
      const { hasDependents, campaignCount, callCount } =
        await this.repository.hasDependentRecords(existing.id);

      if (hasDependents) {
        const newAgent = await this.repository.cloneWithNewApiKey(existing.id, {
          name: dto.name !== undefined ? dto.name.trim() : existing.name,
          apiKeyId: targetApiKeyId,
          appId: effectiveAppId,
          appVersion:
            dto.appVersion !== undefined
              ? Math.max(1, dto.appVersion)
              : existing.appVersion,
          attemptsPerSecond:
            dto.attemptsPerSecond !== undefined
              ? dto.attemptsPerSecond
              : existing.attemptsPerSecond,
          gender: dto.gender !== undefined ? dto.gender : existing.gender,
          type: dto.type ?? existing.type,
          audioUrl: dto.audioUrl !== undefined ? dto.audioUrl : existing.audioUrl,
          audioRecordings:
            dto.audioRecordings !== undefined
              ? dto.audioRecordings
              : this.mapper.parseAudioRecordings(
                  existing.audioRecordings,
                  existing.audioUrl,
                ),
          agentVariables:
            validatedVariables ??
            this.mapper.parseAgentVariables(existing.agentVariables),
          welcomeMessage:
            validatedWelcomeMessage ??
            this.mapper.parseWelcomeMessage(existing.welcomeMessage),
          outputVariables:
            validatedOutputVariables ??
            this.mapper.parseOutputVariables(existing.outputVariables),
          connectionConfigs:
            validatedConnectionConfigs ??
            this.mapper.parseConnectionConfigs(existing.connectionConfigs),
          retryConfig:
            validatedRetryConfig ??
            this.mapper.parseRetryConfig(existing.retryConfig),
          allowedSchedule:
            dto.allowedSchedule !== undefined
              ? dto.allowedSchedule
              : this.mapper.parseAllowedSchedule(existing.allowedSchedule),
          allowTenantVisible:
            dto.allowTenantVisible !== undefined
              ? dto.allowTenantVisible
              : existing.allowTenantVisible,
          status: dto.status ?? (existing.status as "ACTIVE" | "ARCHIVED"),
          goals:
            dto.goals !== undefined
              ? dto.goals.map((g) => ({
                  outputVariableName: g.outputVariableName,
                  expectedValue: g.expectedValue,
                  displayName: g.displayName,
                }))
              : (existing.goals || []).map((g) => ({
                  outputVariableName: g.outputVariableName,
                  expectedValue: g.expectedValue,
                  displayName: g.displayName,
                })),
          createdBy: dto.updatedBy ?? existing.createdBy,
        });

        this.logger?.info(
          "Sarvam Agent reassigned via Copy-on-Write due to dependent records",
          {
            action: "sarvam_agent.reassigned_cow",
            originalAgentId: existing.id,
            newAgentId: newAgent.id,
            targetApiKeyId,
            campaignCount,
            callCount,
            updatedBy: dto.updatedBy,
          },
        );

        return this.mapper.toAdminDTO(newAgent);
      }
    }

    const updated = await this.repository.update(dto.id, {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(isApiKeyChanged && { apiKeyId: targetApiKeyId }),
      ...(dto.appId !== undefined && { appId: dto.appId.trim() }),
      ...(dto.appVersion !== undefined && {
        appVersion: Math.max(1, dto.appVersion),
      }),
      ...(dto.attemptsPerSecond !== undefined && {
        attemptsPerSecond: dto.attemptsPerSecond,
      }),
      ...(dto.gender !== undefined && { gender: dto.gender }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.audioUrl !== undefined && { audioUrl: dto.audioUrl }),
      ...(dto.audioRecordings !== undefined && {
        audioRecordings: dto.audioRecordings,
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

    this.logger?.info(
      isApiKeyChanged
        ? "Reassigned Sarvam Agent in-place (no dependent records)"
        : "Updated Sarvam Agent",
      {
        action: isApiKeyChanged
          ? "sarvam_agent.reassigned_in_place"
          : "sarvam_agent.updated",
        agentId: updated.id,
        apiKeyId: updated.apiKeyId,
        updatedBy: dto.updatedBy,
      },
    );

    return this.mapper.toAdminDTO(updated);
  }
}
