import type { SarvamAgent, SarvamAgentTenantOverride } from "@prisma/client";
import type { SarvamAgentWithApiKeyAndTenant } from "../interfaces/sarvam-agent-repository.interface";
import type {
  SarvamAgentVariable,
  WelcomeMessageConfig,
  SarvamOutputVariable,
  EffectiveSarvamVariable,
} from "../../domain/types/sarvam-agent.types";
import type {
  SarvamAgentAdminResponseDTO,
  TenantSarvamAgentSummaryDTO,
  TenantSarvamAgentDetailDTO,
} from "../dto/sarvam-agent.dto";

export class SarvamAgentMapper {
  parseAgentVariables(data: unknown): SarvamAgentVariable[] {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data as SarvamAgentVariable[];
    }
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? (parsed as SarvamAgentVariable[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  parseWelcomeMessage(data: unknown): WelcomeMessageConfig {
    if (!data) return { defaultMessage: "" };
    if (typeof data === "object" && data !== null && "defaultMessage" in data) {
      return data as WelcomeMessageConfig;
    }
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null && "defaultMessage" in parsed) {
          return parsed as WelcomeMessageConfig;
        }
      } catch {
        return { defaultMessage: data };
      }
    }
    return { defaultMessage: "" };
  }

  parseOutputVariables(data: unknown): SarvamOutputVariable[] {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data as SarvamOutputVariable[];
    }
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? (parsed as SarvamOutputVariable[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  parseVariableOverrides(data: unknown): Record<string, string> {
    if (!data) return {};
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return data as Record<string, string>;
    }
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, string>)
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  toAdminDTO(agent: SarvamAgentWithApiKeyAndTenant): SarvamAgentAdminResponseDTO {
    return {
      id: agent.id,
      name: agent.name,
      apiKeyId: agent.apiKeyId,
      appId: agent.appId,
      appVersion: agent.appVersion,
      attemptsPerSecond: agent.attemptsPerSecond,
      webhookUrl: agent.webhookUrl,
      agentVariables: this.parseAgentVariables(agent.agentVariables),
      welcomeMessage: this.parseWelcomeMessage(agent.welcomeMessage),
      outputVariables: this.parseOutputVariables(agent.outputVariables),
      allowTenantVisible: agent.allowTenantVisible,
      status: agent.status as "ACTIVE" | "ARCHIVED",
      createdBy: agent.createdBy,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
      apiKey: agent.apiKey
        ? {
            id: agent.apiKey.id,
            workspaceId: agent.apiKey.workspaceId,
            organizationId: agent.apiKey.organizationId,
            isActive: agent.apiKey.isActive,
            tenant: {
              id: agent.apiKey.tenant.id,
              name: agent.apiKey.tenant.name,
              email: agent.apiKey.tenant.email,
            },
          }
        : undefined,
    };
  }

  toTenantSummaryDTO(agent: SarvamAgent): TenantSarvamAgentSummaryDTO {
    return {
      id: agent.id,
      name: agent.name,
      appId: agent.appId,
      appVersion: agent.appVersion,
      status: "ACTIVE",
      allowTenantVisible: agent.allowTenantVisible,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  toTenantDetailDTO(
    agent: SarvamAgent,
    override?: SarvamAgentTenantOverride | null,
  ): TenantSarvamAgentDetailDTO {
    const rawVariables = this.parseAgentVariables(agent.agentVariables);
    const overridesMap = override ? this.parseVariableOverrides(override.variableOverrides) : {};

    // Filter to only tenant-visible variables and compute effective values
    const effectiveVariables: EffectiveSarvamVariable[] = rawVariables
      .filter((v) => v.isTenantVisible)
      .map((v) => {
        const hasCustomOverride =
          v.isTenantEditable &&
          Object.prototype.hasOwnProperty.call(overridesMap, v.key) &&
          overridesMap[v.key] !== undefined &&
          overridesMap[v.key] !== null;

        const effectiveValue = hasCustomOverride
          ? overridesMap[v.key]
          : v.defaultValue;

        return {
          key: v.key,
          defaultValue: v.defaultValue,
          effectiveValue,
          isTenantEditable: v.isTenantEditable,
          isOverridden: hasCustomOverride,
        };
      });

    const platformWelcome = this.parseWelcomeMessage(agent.welcomeMessage);
    const customMessage =
      override?.welcomeMessage !== null && override?.welcomeMessage !== undefined
        ? override.welcomeMessage.trim()
        : null;

    const hasCustomWelcome = customMessage !== null && customMessage.length > 0;
    const effectiveWelcome = hasCustomWelcome
      ? customMessage
      : platformWelcome.defaultMessage;

    return {
      id: agent.id,
      name: agent.name,
      appId: agent.appId,
      appVersion: agent.appVersion,
      attemptsPerSecond: agent.attemptsPerSecond,
      webhookUrl: agent.webhookUrl,
      status: "ACTIVE",
      welcomeMessage: {
        defaultMessage: platformWelcome.defaultMessage,
        customMessage,
        effectiveMessage: effectiveWelcome,
        isOverridden: hasCustomWelcome,
      },
      variables: effectiveVariables,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }
}

