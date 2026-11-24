import { ValidationError } from "../../../../shared/errors/validation.error";
import { SarvamAgentInvalidOverrideError } from "../errors/sarvam-agent.errors";
import type {
  SarvamAgentVariable,
  SarvamConnectionConfig,
  SarvamRetryConfig,
  SarvamVariableDataType,
  SarvamVariableInputType,
} from "../types/sarvam-agent.types";

export function validateConnectionConfigs(
  configs: unknown,
): SarvamConnectionConfig[] {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new ValidationError([
      {
        field: "connectionConfigs",
        message: "At least one telephony connection configuration is required.",
      },
    ]);
  }

  const cleaned: SarvamConnectionConfig[] = [];
  for (let i = 0; i < configs.length; i++) {
    const entry = configs[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}]`,
          message: "Connection configuration must be a valid object.",
        },
      ]);
    }

    const { connection_id, agent_phone_number, phone_numbers, ...extra } = entry as Record<
      string,
      unknown
    >;

    if (Object.keys(extra).length > 0) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}]`,
          message: "Unrecognized properties in connection configuration.",
        },
      ]);
    }

    if (typeof connection_id !== "string" || !connection_id.trim()) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}].connection_id`,
          message: "connection_id is required and cannot be empty.",
        },
      ]);
    }

    if (typeof agent_phone_number !== "string" || !agent_phone_number.trim()) {
      throw new ValidationError([
        {
          field: `connectionConfigs[${i}].agent_phone_number`,
          message: "agent_phone_number is required and cannot be empty.",
        },
      ]);
    }

    const resolvedPhoneNumbers: string[] =
      Array.isArray(phone_numbers) && phone_numbers.length > 0
        ? phone_numbers.map((p) => String(p).trim()).filter(Boolean)
        : [agent_phone_number.trim()];

    cleaned.push({
      connection_id: connection_id.trim(),
      agent_phone_number: agent_phone_number.trim(),
      phone_numbers: resolvedPhoneNumbers,
    });
  }

  return cleaned;
}

export { validateSarvamRetryConfig as validateRetryConfig } from "./sarvam-retry-config.rules";

export function validateSarvamAgentVariables(
  variables: unknown,
): SarvamAgentVariable[] {
  if (variables === undefined || variables === null) {
    return [];
  }
  if (!Array.isArray(variables)) {
    throw new ValidationError([
      {
        field: "agentVariables",
        message: "agentVariables must be an array.",
      },
    ]);
  }

  const cleaned: SarvamAgentVariable[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new ValidationError([
        {
          field: `agentVariables[${i}]`,
          message: "Variable definition must be an object.",
        },
      ]);
    }

    const raw = v as Record<string, unknown>;
    const rawKey = typeof raw.key === "string" ? raw.key.trim() : "";
    if (!rawKey) {
      throw new ValidationError([
        {
          field: `agentVariables[${i}].key`,
          message: "Variable key is required and cannot be empty.",
        },
      ]);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(rawKey)) {
      throw new ValidationError([
        {
          field: `agentVariables[${i}].key`,
          message: `Variable key '${rawKey}' contains invalid characters. Only alphanumeric, underscores, and hyphens are allowed.`,
        },
      ]);
    }

    if (seenKeys.has(rawKey)) {
      throw new SarvamAgentInvalidOverrideError(
        `Duplicate variable key '${rawKey}' defined in agent variables.`,
        `agentVariables[${i}].key`,
      );
    }
    seenKeys.add(rawKey);

    const rawDataType = raw.dataType ?? "string";
    if (rawDataType !== "string") {
      throw new ValidationError([
        {
          field: `agentVariables[${i}].dataType`,
          message: `Supported data type is 'string'. Received '${rawDataType}'.`,
        },
      ]);
    }
    const dataType: SarvamVariableDataType = "string";

    const rawInputType = raw.inputType ?? "text";
    if (rawInputType !== "text" && rawInputType !== "textarea") {
      throw new ValidationError([
        {
          field: `agentVariables[${i}].inputType`,
          message: `Supported input types are 'text' and 'textarea'. Received '${rawInputType}'.`,
        },
      ]);
    }
    const inputType: SarvamVariableInputType = rawInputType;

    const defaultValue =
      typeof raw.defaultValue === "string" ? raw.defaultValue : "";

    cleaned.push({
      key: rawKey,
      dataType,
      inputType,
      required: Boolean(raw.required ?? false),
      defaultValue,
      description:
        typeof raw.description === "string" ? raw.description.trim() : null,
      isTenantVisible:
        raw.isTenantVisible !== undefined ? Boolean(raw.isTenantVisible) : true,
      isTenantEditable:
        raw.isTenantEditable !== undefined ? Boolean(raw.isTenantEditable) : true,
    });
  }

  return cleaned;
}

