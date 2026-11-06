import { normalizePhoneNumber } from "../../leads/domain/rules/phone.rules";
import type { LeadRow } from "../../leads/infrastructure/leadParser";
import { serializeCsv } from "../../../shared/utils/csv";
import type {
  SarvamAgentVariable,
  WelcomeMessageConfig,
} from "../../sarvam-agents/domain/types/sarvam-agent.types";
import type { Logger } from "../../../shared/logging/logger.interface";

export interface SarvamCohortTransformResult {
  transformedCsvBuffer: Buffer;
  transformationJson: {
    phone_number: {
      column_name: string;
      required: boolean;
      formatting_functions: unknown[];
      country_code: string;
    };
    user_identifier: null;
    app_variables: Record<
      string,
      {
        column_name: string;
        required: boolean;
        formatting_functions: unknown[];
      }
    >;
    app_overrides: Record<string, unknown>;
    alternate_phone_numbers: unknown[];
  };
  matchedVariables: string[];
  missingRequiredVariables: string[];
  totalLeads: number;
}

export class SarvamCohortTransformer {
  transform(
    leads: LeadRow[],
    agentVariables: SarvamAgentVariable[] = [],
    variableOverrides: Record<string, string> = {},
    campaignVariables: Record<string, string> = {},
    welcomeMessageConfig?: WelcomeMessageConfig,
    logger?: Logger,
  ): SarvamCohortTransformResult {
    const agentVarMap = new Map<string, SarvamAgentVariable>();
    for (const v of agentVariables) {
      agentVarMap.set(v.key, v);
    }

    // Identify if a welcome message should be injected into the cohort
    const hasWelcomeMessageConfig = Boolean(
      welcomeMessageConfig &&
        ((welcomeMessageConfig.customTemplate &&
          welcomeMessageConfig.customTemplate.trim().length > 0) ||
          (welcomeMessageConfig.defaultMessage &&
            welcomeMessageConfig.defaultMessage.trim().length > 0)),
    );

    const baseVariables = agentVariables.map((v) => v.key);
    const matchedVariables = [...baseVariables];

    // If welcome message is configured and welcome_message isn't already an agent variable, append it
    const shouldInjectWelcomeVar =
      hasWelcomeMessageConfig && !matchedVariables.includes("welcome_message");
    if (shouldInjectWelcomeVar) {
      matchedVariables.push("welcome_message");
    }

    const missingRequiredSet = new Set<string>();
    const headers = ["contact_number", ...matchedVariables];
    const dataRows: string[][] = [];

    // Parse template placeholders if customTemplate exists
    let templatePlaceholders: string[] = [];
    if (welcomeMessageConfig?.customTemplate?.trim()) {
      const matches =
        welcomeMessageConfig.customTemplate.match(/\{\{([^}]+)\}\}/g) || [];
      templatePlaceholders = matches.map((m) => m.slice(2, -2).trim());
    }

    for (const lead of leads) {
      const normalizedPhone = normalizePhoneNumber(lead.phone);
      if (!normalizedPhone.startsWith("+91")) {
        continue;
      }

      // 1. Resolve contact merged variables with 3-tier precedence:
      // Contact CSV > Campaign-level value > Agent override > Agent Default
      const contactMergedVars: Record<string, string> = {};

      for (const varKey of baseVariables) {
        let val: string | undefined = undefined;

        // Try exact match on lead row or metadata
        if (lead[varKey] !== undefined && lead[varKey] !== null) {
          val = String(lead[varKey]).trim();
        } else if (
          lead.metadata &&
          typeof lead.metadata === "object" &&
          (lead.metadata as Record<string, unknown>)[varKey] !== undefined &&
          (lead.metadata as Record<string, unknown>)[varKey] !== null
        ) {
          val = String((lead.metadata as Record<string, unknown>)[varKey]).trim();
        } else if (
          (varKey === "customer_name" || varKey === "recipient_name") &&
          lead.name
        ) {
          val = lead.name.trim();
        }

        // Fallbacks: Campaign -> Override -> Agent Default -> ""
        if (val === undefined || val === "") {
          if (
            campaignVariables[varKey] !== undefined &&
            campaignVariables[varKey].trim() !== ""
          ) {
            val = campaignVariables[varKey].trim();
          } else if (
            variableOverrides[varKey] !== undefined &&
            variableOverrides[varKey].trim() !== ""
          ) {
            val = variableOverrides[varKey].trim();
          } else {
            val = agentVarMap.get(varKey)?.defaultValue?.trim() ?? "";
          }
        }

        contactMergedVars[varKey] = val;

        // Validate required agent variables for each contact
        const isRequired = agentVarMap.get(varKey)?.required ?? false;
        if (isRequired && (!val || val.trim() === "")) {
          missingRequiredSet.add(varKey);
        }
      }

      // 2. Generate welcome message if configured
      let resolvedWelcomeMessage = "";
      if (hasWelcomeMessageConfig && welcomeMessageConfig) {
        const customTemplate = welcomeMessageConfig.customTemplate?.trim();

        if (customTemplate && templatePlaceholders.length > 0) {
          // Check if all interpolation variables are available and non-empty
          const missingPlaceholders = templatePlaceholders.filter(
            (p) =>
              !contactMergedVars[p] || contactMergedVars[p].trim() === "",
          );

          if (missingPlaceholders.length === 0) {
            // All variables present: interpolate
            resolvedWelcomeMessage = customTemplate.replace(
              /\{\{([^}]+)\}\}/g,
              (_, rawKey) => {
                const cleanKey = rawKey.trim();
                return contactMergedVars[cleanKey] ?? "";
              },
            );
          } else {
            // Missing interpolation variable: fall back completely to static greeting
            logger?.warn(
              "Sarvam welcome message missing interpolation variable, falling back to static default greeting",
              {
                action: "sarvam_cohort_transformer.welcome_message_fallback",
                missingVariables: missingPlaceholders,
              },
            );
            resolvedWelcomeMessage = welcomeMessageConfig.defaultMessage ?? "";
          }
        } else {
          resolvedWelcomeMessage = welcomeMessageConfig.defaultMessage ?? "";
        }
      }

      // 3. Assemble CSV row values
      const rowValues: string[] = [normalizedPhone];
      for (const varKey of baseVariables) {
        if (varKey === "welcome_message" && hasWelcomeMessageConfig) {
          rowValues.push(resolvedWelcomeMessage);
        } else {
          rowValues.push(contactMergedVars[varKey] ?? "");
        }
      }

      dataRows.push(rowValues);
    }

    const csvContent = serializeCsv(headers, dataRows);
    const transformedCsvBuffer = Buffer.from(csvContent, "utf-8");

    // Build transformation JSON mapping CSV columns to app_variables
    const appVariablesMap: Record<
      string,
      { column_name: string; required: boolean; formatting_functions: unknown[] }
    > = {};

    for (const varKey of baseVariables) {
      const isRequired = agentVarMap.get(varKey)?.required ?? false;
      appVariablesMap[varKey] = {
        column_name: varKey,
        required: isRequired,
        formatting_functions: [],
      };
    }

    const appOverridesMap: Record<string, unknown> = {};
    if (hasWelcomeMessageConfig) {
      // If welcome_message is an explicit agent variable in Sarvam, it's already mapped in appVariablesMap.
      // Otherwise, map it to Sarvam's app_overrides.initial_bot_message so Sarvam overrides the greeting without error.
      if (!agentVarMap.has("welcome_message")) {
        appOverridesMap["initial_bot_message"] = {
          column_name: "welcome_message",
        };
      }
    }

    const transformationJson = {
      phone_number: {
        column_name: "contact_number",
        required: true,
        formatting_functions: [],
        country_code: "IN",
      },
      user_identifier: null,
      app_variables: appVariablesMap,
      app_overrides: appOverridesMap,
      alternate_phone_numbers: [],
    };

    return {
      transformedCsvBuffer,
      transformationJson,
      matchedVariables,
      missingRequiredVariables: Array.from(missingRequiredSet),
      totalLeads: dataRows.length,
    };
  }
}
