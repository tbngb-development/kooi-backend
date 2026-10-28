import type { PlatformAgentType } from "@prisma/client";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  AssistantVariablesConfig,
  AssistantCallTypeConfig,
  WelcomeMessageConfig,
} from "../types/assistant-variable.types";
import { AssistantVariableValidationError } from "../errors/assistant.errors";

/**
 * Extracts variable names from a template string.
 * Supports:
 * - `${variable_name}`
 * - `{{variable_name}}`
 * - `{variable_name}`
 */
export function extractTemplateVariables(template: string): string[] {
  if (!template) return [];

  const found = new Set<string>();

  // Match ${var}
  const dollarRegex = /\$\{([a-zA-Z0-9_]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = dollarRegex.exec(template)) !== null) {
    if (match[1]) found.add(match[1]);
  }

  // Match {{var}}
  const doubleBraceRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  while ((match = doubleBraceRegex.exec(template)) !== null) {
    if (match[1]) found.add(match[1]);
  }

  // Match {var} (avoiding already matched {{var}})
  const singleBraceRegex = /(?<!\{)\{([a-zA-Z0-9_]+)\}(?!\})/g;
  while ((match = singleBraceRegex.exec(template)) !== null) {
    if (match[1]) found.add(match[1]);
  }

  return Array.from(found);
}

/**
 * Resolves a dynamic welcome message based on configuration and provided variables.
 * If type is 'custom', evaluates template variables. If all referenced variables are non-empty and non-null,
 * the interpolated custom message is returned.
 * If any referenced variable is missing/empty, or if type is 'default', returns defaultValue (or fallbackDefault).
 */
export function resolveWelcomeMessage(
  welcomeConfig: WelcomeMessageConfig | undefined,
  variables: Record<string, string> | undefined,
  fallbackDefault: string = "",
): string {
  if (!welcomeConfig) {
    return fallbackDefault.trim();
  }

  const effectiveDefault = (welcomeConfig.defaultValue?.trim() || fallbackDefault).trim();

  if (welcomeConfig.type !== "custom") {
    return effectiveDefault;
  }

  const customTemplate = welcomeConfig.customValue?.trim();
  if (!customTemplate) {
    return effectiveDefault;
  }

  const referencedVars = extractTemplateVariables(customTemplate);
  const varMap = variables ?? {};

  // Check if ALL referenced variables exist and are non-empty
  for (const varName of referencedVars) {
    const val = varMap[varName];
    if (val === undefined || val === null || String(val).trim() === "") {
      return effectiveDefault;
    }
  }

  // All variables present and non-empty -> interpolate
  let resolved = customTemplate;
  for (const varName of referencedVars) {
    const val = String(varMap[varName]).trim();
    // Replace ${varName}
    resolved = resolved.split(`\${${varName}}`).join(val);
    // Replace {{varName}}
    resolved = resolved.split(`{{${varName}}}`).join(val);
    // Replace {varName}
    const singleRegex = new RegExp(`(?<!\\{)\\{${varName}\\}(?!\\})`, "g");
    resolved = resolved.replace(singleRegex, val);
  }

  return resolved;
}

/**
 * Validates and cleans a direction's variables against platform-agent requiredVariables constraints.
 */
function validateDirectionVariables(
  direction: "inbound" | "outbound",
  requiredVariables: RequiredVariable[] | null | undefined,
  config: AssistantCallTypeConfig,
): AssistantCallTypeConfig {
  const definitions = requiredVariables ?? [];
  const inputVars = config.variables ?? {};

  const nonEditableNames = new Set(
    definitions.filter((v) => !v.isEditable).map((v) => v.name),
  );

  // Strip non-editable variables from user input and omit empty optional values
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputVars)) {
    if (!nonEditableNames.has(key)) {
      const trimmed = String(value ?? "").trim();
      if (trimmed !== "") {
        cleaned[key] = trimmed;
      }
    }
  }

  // Check required + editable variables, applying defaultValue fallback
  const missing: string[] = [];
  for (const def of definitions) {
    if (def.required && def.isEditable) {
      const value = cleaned[def.name];
      const isEmpty = !value || value.trim() === "";

      if (isEmpty) {
        const defaultValue = def.defaultValue?.trim() ?? "";
        if (defaultValue) {
          cleaned[def.name] = defaultValue;
        } else {
          missing.push(def.name);
        }
      }
    }
  }

  if (missing.length > 0) {
    throw new AssistantVariableValidationError(
      `Missing required variables for ${direction}: ${missing.join(", ")}`,
    );
  }

  // Validate welcomeMessage structure if present
  let welcomeMessage = config.welcomeMessage;
  if (welcomeMessage) {
    if (!["default", "custom"].includes(welcomeMessage.type)) {
      throw new AssistantVariableValidationError(
        `Invalid welcome message type for ${direction}: ${welcomeMessage.type}`,
      );
    }

    const defaultVal = welcomeMessage.defaultValue?.trim() ?? "";
    if (!defaultVal) {
      throw new AssistantVariableValidationError(
        `Default welcome message is required for ${direction}`,
      );
    }

    if (welcomeMessage.type === "custom") {
      const customVal = welcomeMessage.customValue?.trim() ?? "";
      if (!customVal) {
        throw new AssistantVariableValidationError(
          `Custom welcome message template is required when type is 'custom' for ${direction}`,
        );
      }
      welcomeMessage = {
        type: "custom",
        defaultValue: defaultVal,
        customValue: customVal,
      };
    } else {
      welcomeMessage = {
        type: "default",
        defaultValue: defaultVal,
      };
    }
  }

  return {
    variables: cleaned,
    welcomeMessage,
  };
}

/**
 * Validates the full AssistantVariablesConfig against PlatformAgent constraints (agent type and requiredVariables).
 */
export function validateAssistantVariables(
  platformAgentType: PlatformAgentType,
  requiredVariables: RequiredVariable[] | null | undefined,
  inputConfig: AssistantVariablesConfig | null | undefined,
): AssistantVariablesConfig {
  if (!inputConfig) {
    return {};
  }

  const result: AssistantVariablesConfig = {};

  // Check type compatibility
  if (platformAgentType === "OUTBOUND") {
    if (inputConfig.inbound && (inputConfig.inbound.variables || inputConfig.inbound.welcomeMessage)) {
      throw new AssistantVariableValidationError(
        "Platform agent type 'OUTBOUND' does not accept inbound configuration.",
      );
    }
  } else if (platformAgentType === "INBOUND") {
    if (inputConfig.outbound && (inputConfig.outbound.variables || inputConfig.outbound.welcomeMessage)) {
      throw new AssistantVariableValidationError(
        "Platform agent type 'INBOUND' does not accept outbound configuration.",
      );
    }
  }

  if (inputConfig.inbound && ["INBOUND", "BOTH"].includes(platformAgentType)) {
    result.inbound = validateDirectionVariables("inbound", requiredVariables, inputConfig.inbound);
  }

  if (inputConfig.outbound && ["OUTBOUND", "BOTH"].includes(platformAgentType)) {
    result.outbound = validateDirectionVariables("outbound", requiredVariables, inputConfig.outbound);
  }

  return result;
}
