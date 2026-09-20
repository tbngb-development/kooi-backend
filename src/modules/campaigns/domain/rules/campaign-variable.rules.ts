import type { RequiredVariable } from "../../../../shared/types/bolna.types";

export interface VariableValidationResult {
  cleaned: Record<string, string>;
  missing: string[];
}

/**
 * Validates user-provided campaign variables against the platform agent's
 * required variable definitions.
 *
 * Rules:
 * - Variables with `isEditable: false` are stripped from user input (their
 *   values come from the agent's prompt/config, not the campaign).
 * - Variables with `required: true` AND `isEditable: true` must be present
 *   and non-empty in the user input.
 * - Variables with `required: false` are optional and kept if provided.
 */
export function validateAndCleanVariables(
  requiredVariables: RequiredVariable[] | null | undefined,
  inputVariables: Record<string, string> | undefined,
): VariableValidationResult {
  const definitions = requiredVariables ?? [];
  const input = inputVariables ?? {};

  if (definitions.length === 0) {
    return { cleaned: { ...input }, missing: [] };
  }

  const nonEditableNames = new Set(
    definitions.filter((v) => !v.isEditable).map((v) => v.name),
  );

  // Strip non-editable variables from user input
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!nonEditableNames.has(key)) {
      cleaned[key] = value;
    }
  }

  // Check required + editable variables
  const missing: string[] = [];
  for (const def of definitions) {
    if (def.required && def.isEditable) {
      const value = cleaned[def.name];
      if (!value || value.trim() === "") {
        missing.push(def.name);
      }
    }
  }

  return { cleaned, missing };
}
