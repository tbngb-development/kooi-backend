import type { ISarvamAgentRepository } from "../../interfaces/sarvam-agent-repository.interface";
import type { ISarvamAgentOverrideRepository } from "../../interfaces/sarvam-agent-override-repository.interface";
import type { SarvamAgentMapper } from "../../mappers/sarvam-agent.mapper";
import type {
  UpdateTenantVariablesDTO,
  TenantSarvamAgentDetailDTO,
} from "../../dto/sarvam-agent.dto";
import {
  SarvamAgentNotFoundError,
  SarvamAgentInvalidOverrideError,
} from "../../../domain/errors/sarvam-agent.errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class UpdateTenantSarvamAgentVariablesUseCase {
  constructor(
    private readonly repository: ISarvamAgentRepository,
    private readonly overrideRepository: ISarvamAgentOverrideRepository,
    private readonly mapper: SarvamAgentMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    agentId: string,
    tenantId: string,
    dto: UpdateTenantVariablesDTO,
  ): Promise<TenantSarvamAgentDetailDTO> {
    const agent = await this.repository.findAccessibleForTenant(
      agentId,
      tenantId,
    );
    if (!agent) {
      throw new SarvamAgentNotFoundError(agentId);
    }

    const platformVariables = this.mapper.parseAgentVariables(
      agent.agentVariables,
    );
    const platformVarMap = new Map(platformVariables.map((v) => [v.key, v]));

    // Fetch existing overrides for this tenant
    const existingOverride =
      await this.overrideRepository.findByAgentAndTenant(agentId, tenantId);
    const currentOverrides = existingOverride
      ? this.mapper.parseVariableOverrides(existingOverride.variableOverrides)
      : {};

    const updatedOverrides = { ...currentOverrides };

    // Validate and process incoming keys
    for (const [key, val] of Object.entries(dto.variables)) {
      const def = platformVarMap.get(key);
      if (!def) {
        throw new SarvamAgentInvalidOverrideError(
          `Variable '${key}' is not defined on this agent.`,
        );
      }

      if (!def.isTenantVisible || !def.isTenantEditable) {
        throw new SarvamAgentInvalidOverrideError(
          `Variable '${key}' is not editable by tenants.`,
        );
      }

      if (val === null) {
        // Clear override (restore default)
        delete updatedOverrides[key];
      } else {
        // Explicit string value (can be empty string "")
        updatedOverrides[key] = String(val);
      }
    }

    // Clean up any stale overrides that are no longer editable in the platform definition
    for (const key of Object.keys(updatedOverrides)) {
      const def = platformVarMap.get(key);
      if (!def || !def.isTenantVisible || !def.isTenantEditable) {
        delete updatedOverrides[key];
      }
    }

    const savedOverride = await this.overrideRepository.upsertVariables(
      agentId,
      tenantId,
      updatedOverrides,
    );

    this.logger?.info("Updated tenant Sarvam agent variables", {
      action: "sarvam_agent_tenant.variables_updated",
      agentId,
      tenantId,
      variableKeys: Object.keys(dto.variables),
    });

    return this.mapper.toTenantDetailDTO(agent, savedOverride);
  }
}
