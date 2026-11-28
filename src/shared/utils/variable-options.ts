/** Reserved UI sentinel. Campaign values are stored as the plain custom string, not as this sentinel. */
export const OTHER_OPTION_VALUE = "__other__";

/** Both the display label and the UI sentinel must stay out of predefined options. */
const RESERVED_OPTIONS = new Set([OTHER_OPTION_VALUE, "other"]);

export interface SelectVariableOptionsInput {
  inputType?: string | null;
  options?: string[];
  defaultValue?: string | null;
}

export interface SelectVariableOptionIssue {
  path: string[];
  message: string;
}

/**
 * Shared validation for select variable definitions across Bolna and Sarvam agents.
 * Keeps the reserved "Other" value and option constraints identical on both paths.
 */
export function getSelectVariableOptionIssues(
  data: SelectVariableOptionsInput,
): SelectVariableOptionIssue[] {
  if (data.inputType !== "select") return [];

  const options = data.options ?? [];
  if (options.length === 0) {
    return [
      {
        path: ["options"],
        message: "At least one option is required for a select variable.",
      },
    ];
  }

  const issues: SelectVariableOptionIssue[] = [];

  if (options.some((option) => RESERVED_OPTIONS.has(option.toLowerCase()))) {
    issues.push({
      path: ["options"],
      message: "'Other' is reserved for custom values and cannot be a predefined option.",
    });
  }

  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    issues.push({
      path: ["options"],
      message: "Options must be unique.",
    });
  }

  if (
    data.defaultValue &&
    data.defaultValue.trim() !== "" &&
    !options.includes(data.defaultValue)
  ) {
    issues.push({
      path: ["defaultValue"],
      message: "Default value must be one of the configured options.",
    });
  }

  return issues;
}

/** Trims option strings and drops empty/non-string entries. */
export function normalizeVariableOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((option): option is string => typeof option === "string")
    .map((option) => option.trim())
    .filter(Boolean);
}
