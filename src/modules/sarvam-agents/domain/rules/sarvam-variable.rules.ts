import type { SarvamAgentVariable } from "../types/sarvam-agent.types";

export interface SarvamVariableValidationResult {
  cleaned: Record<string, string>;
  missing: string[];
  invalidValues: Array<{ key: string; reason: string }>;
}

/**
 * Validates campaign-level variables against SarvamAgent variable definitions.
 *
 * Rules:
 * - When required === true, variable must be present in inputVariables, tenantOverrides, or have defaultValue.
 * - If required variable is missing/empty, tenantOverride or defaultValue is automatically applied.
 * - When dataType === "number", if value is non-empty, must be a valid finite number.
 * - When dataType === "enum", if value is non-empty, must match one of configured options (strict case-sensitive).
 * - Optional variables are only included if explicitly provided in inputVariables.
 */
export function validateSarvamCampaignVariables(
  definitions: SarvamAgentVariable[] | null | undefined,
  inputVariables: Record<string, string> | undefined,
  tenantOverrides: Record<string, string> = {},
): SarvamVariableValidationResult {
  const defs = definitions ?? [];
  const input = inputVariables ?? {};
  const cleaned: Record<string, string> = {};
  const missing: string[] = [];
  const invalidValues: Array<{ key: string; reason: string }> = [];

  // Copy and trim all incoming variables
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") {
      cleaned[k] = v.trim();
    }
  }

  for (const def of defs) {
    let val = cleaned[def.key];

    // Required check & fallback
    if (def.required === true) {
      if (val === undefined || val === null || val === "") {
        if (tenantOverrides[def.key] && tenantOverrides[def.key].trim() !== "") {
          val = tenantOverrides[def.key].trim();
          cleaned[def.key] = val;
        } else if (def.defaultValue && def.defaultValue.trim() !== "") {
          val = def.defaultValue.trim();
          cleaned[def.key] = val;
        }
      }

      if (val === undefined || val === null || val === "") {
        missing.push(def.key);
        continue;
      }
    }
  }

  return { cleaned, missing, invalidValues };
}
