import type { SarvamAgent, SarvamAgentTenantOverride } from "@prisma/client";
import type { SarvamAgentWithApiKeyAndTenant } from "../interfaces/sarvam-agent-repository.interface";
import type {
  SarvamAgentVariable,
  WelcomeMessageConfig,
  SarvamOutputVariable,
  EffectiveSarvamVariable,
  SarvamConnectionConfig,
  SarvamRetryConfig,
  SarvamRetryCondition,
} from "../../domain/types/sarvam-agent.types";
import type {
  SarvamAgentAdminResponseDTO,
  TenantSarvamAgentSummaryDTO,
  TenantSarvamAgentDetailDTO,
} from "../dto/sarvam-agent.dto";

export class SarvamAgentMapper {
  parseAgentVariables(data: unknown): SarvamAgentVariable[] {
    if (!data) return [];
    let items: unknown[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        return [];
      }
    } else {
      return [];
    }

    return items
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        key: String(item.key ?? "").trim(),
        defaultValue: String(item.defaultValue ?? ""),
        isTenantVisible: item.isTenantVisible !== undefined ? Boolean(item.isTenantVisible) : true,
        isTenantEditable: item.isTenantEditable !== undefined ? Boolean(item.isTenantEditable) : true,
        required: Boolean(item.required ?? false),
      }));
  }

  parseWelcomeMessage(data: unknown): WelcomeMessageConfig {
    if (!data) return { defaultMessage: "" };
    let parsedObj: Record<string, unknown> | null = null;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      parsedObj = data as Record<string, unknown>;
    } else if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          parsedObj = parsed;
        } else {
          return { defaultMessage: data };
        }
      } catch {
        return { defaultMessage: data };
      }
    }
    if (parsedObj) {
      return {
        defaultMessage: typeof parsedObj.defaultMessage === "string" ? parsedObj.defaultMessage : "",
        customTemplate:
          typeof parsedObj.customTemplate === "string" ? parsedObj.customTemplate : null,
        interpolationVariables: Array.isArray(parsedObj.interpolationVariables)
          ? parsedObj.interpolationVariables.map((v) => String(v).trim()).filter(Boolean)
          : [],
      };
    }
    return { defaultMessage: "" };
  }

  parseOutputVariables(data: unknown): SarvamOutputVariable[] {
    if (!data) return [];
    let items: unknown[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        return [];
      }
    } else {
      return [];
    }

    return items
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        description: String(item.description ?? "").trim(),
        type: item.type === "enum" ? "enum" : "string",
        options: Array.isArray(item.options)
          ? item.options.map((opt) => String(opt).trim()).filter(Boolean)
          : [],
      }));
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

  parseConnectionConfigs(data: unknown): SarvamConnectionConfig[] {
    let items = data;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(items)) return [];
    return items
      .filter((item): item is SarvamConnectionConfig => {
        return (
          typeof item === "object" &&
          item !== null &&
          typeof (item as any).connection_id === "string" &&
          typeof (item as any).agent_phone_number === "string"
        );
      })
      .map((item) => ({
        connection_id: item.connection_id.trim(),
        agent_phone_number: item.agent_phone_number?.trim() || "",
        phone_numbers:
          (item as any).phone_numbers ||
          (item.agent_phone_number ? [item.agent_phone_number.trim()] : []),
      }));
  }

  parseRetryConfig(data: unknown): SarvamRetryConfig {
    let raw = data;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        return { max_retries: 0 };
      }
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { max_retries: 0 };
    }

    const rawObj = raw as Record<string, unknown>;
    const max_retries =
      typeof rawObj.max_retries === "number" && !isNaN(rawObj.max_retries)
        ? Math.max(0, Math.min(20, Math.floor(rawObj.max_retries)))
        : 0;

    const result: SarvamRetryConfig = { max_retries };

    if (
      typeof rawObj.retry_on === "object" &&
      rawObj.retry_on !== null &&
      !Array.isArray(rawObj.retry_on)
    ) {
      const retryOn: Record<string, SarvamRetryCondition> = {};
      for (const [key, val] of Object.entries(rawObj.retry_on)) {
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          const condition = val as Record<string, unknown>;
          if (typeof condition.enabled === "boolean") {
            const parsedCond: SarvamRetryCondition = {
              enabled: condition.enabled,
            };
            if (
              typeof condition.threshold_seconds === "number" &&
              !isNaN(condition.threshold_seconds) &&
              condition.threshold_seconds >= 0
            ) {
              parsedCond.threshold_seconds = Math.floor(condition.threshold_seconds);
            }
            retryOn[key] = parsedCond;
          }
        }
      }
      result.retry_on = retryOn;
    }

    if (
      typeof rawObj.retry_interval_minutes === "number" &&
      !isNaN(rawObj.retry_interval_minutes) &&
      rawObj.retry_interval_minutes >= 0
    ) {
      result.retry_interval_minutes = Math.floor(rawObj.retry_interval_minutes);
    } else if (Array.isArray(rawObj.retry_interval_minutes)) {
      result.retry_interval_minutes = rawObj.retry_interval_minutes
        .filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0)
        .map((x) => Math.floor(x));
    }

    return result;
  }

  toAdminDTO(agent: SarvamAgentWithApiKeyAndTenant): SarvamAgentAdminResponseDTO {
    return {
      id: agent.id,
      name: agent.name,
      apiKeyId: agent.apiKeyId,
      appId: agent.appId,
      appVersion: agent.appVersion,
      attemptsPerSecond: agent.attemptsPerSecond,
      agentVariables: this.parseAgentVariables(agent.agentVariables),
      welcomeMessage: this.parseWelcomeMessage(agent.welcomeMessage),
      outputVariables: this.parseOutputVariables(agent.outputVariables),
      connectionConfigs: this.parseConnectionConfigs(agent.connectionConfigs),
      retryConfig: this.parseRetryConfig(agent.retryConfig),
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
          required: v.required,
        };
      });

    const agentWelcome = this.parseWelcomeMessage(agent.welcomeMessage);
    const customMessage =
      override?.welcomeMessage !== null && override?.welcomeMessage !== undefined
        ? override.welcomeMessage.trim()
        : null;

    const hasCustomWelcome = customMessage !== null && customMessage.length > 0;
    const effectiveWelcome = hasCustomWelcome
      ? customMessage
      : agentWelcome.defaultMessage;

    return {
      id: agent.id,
      name: agent.name,
      appId: agent.appId,
      appVersion: agent.appVersion,
      attemptsPerSecond: agent.attemptsPerSecond,
      status: "ACTIVE",
      welcomeMessage: {
        defaultMessage: agentWelcome.defaultMessage,
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
