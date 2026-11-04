import { normalizePhoneNumber } from "../../leads/domain/rules/phone.rules";
import { cleanCustomerName } from "../../leads/domain/rules/name.rules";
import type { LeadRow } from "../../leads/infrastructure/leadParser";
import { serializeCsv } from "../../../shared/utils/csv";
import type { SarvamAgentVariable } from "../../sarvam-agents/domain/types/sarvam-agent.types";

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
  ): SarvamCohortTransformResult {
    // 1. Identify which agent variables are required
    const requiredVariableKeys: string[] = [];
    const agentVarMap = new Map<string, SarvamAgentVariable>();

    for (const v of agentVariables) {
      agentVarMap.set(v.key, v);
      const hasDefault = Boolean(v.defaultValue && v.defaultValue.trim() !== "");
      const hasOverride = Boolean(
        variableOverrides[v.key] && variableOverrides[v.key].trim() !== "",
      );
      const hasCampaignVal = Boolean(
        campaignVariables[v.key] && campaignVariables[v.key].trim() !== "",
      );

      if (!hasDefault && !hasOverride && !hasCampaignVal) {
        requiredVariableKeys.push(v.key);
      }
    }

    // 2. Determine which agent variables exist in the uploaded lead rows
    const availableCsvColumns = new Set<string>();
    for (const lead of leads) {
      for (const col of Object.keys(lead)) {
        if (col && lead[col] !== undefined && lead[col] !== null) {
          availableCsvColumns.add(col);
        }
      }
      if (lead.metadata && typeof lead.metadata === "object") {
        for (const col of Object.keys(lead.metadata)) {
          availableCsvColumns.add(col);
        }
      }
    }

    // If customer_name is an agent variable and lead has name, consider it available
    if (agentVarMap.has("customer_name") && leads.some((l) => Boolean(l.name))) {
      availableCsvColumns.add("customer_name");
    }

    // 3. Check for missing required variables
    const missingRequiredVariables: string[] = [];
    for (const reqKey of requiredVariableKeys) {
      if (!availableCsvColumns.has(reqKey)) {
        missingRequiredVariables.push(reqKey);
      }
    }

    // 4. Find all agent variables that match CSV columns or have values
    const matchedVariables: string[] = [];
    for (const v of agentVariables) {
      const isAvailableInCsv = availableCsvColumns.has(v.key);
      const hasOverride = Boolean(variableOverrides[v.key]);
      const hasCampaignVal = Boolean(campaignVariables[v.key]);
      const hasDefault = Boolean(v.defaultValue && v.defaultValue.trim() !== "");

      if (isAvailableInCsv || hasOverride || hasCampaignVal || hasDefault) {
        matchedVariables.push(v.key);
      }
    }

    // 5. Construct CSV headers: ["contact_number", ...matchedVariables]
    const headers = ["contact_number", ...matchedVariables];
    const dataRows: string[][] = [];

    for (const lead of leads) {
      const normalizedPhone = normalizePhoneNumber(lead.phone);
      if (!normalizedPhone.startsWith("+91")) {
        continue;
      }

      const rowValues: string[] = [normalizedPhone];

      for (const varKey of matchedVariables) {
        let val: string | undefined = undefined;

        // Try exact match on lead row
        if (lead[varKey] !== undefined && lead[varKey] !== null) {
          val = String(lead[varKey]);
        } else if (
          lead.metadata &&
          typeof lead.metadata === "object" &&
          (lead.metadata as Record<string, unknown>)[varKey] !== undefined &&
          (lead.metadata as Record<string, unknown>)[varKey] !== null
        ) {
          val = String((lead.metadata as Record<string, unknown>)[varKey]);
        } else if (varKey === "customer_name" && lead.name) {
          val = lead.name;
        }

        // Fallbacks: variableOverrides -> campaignVariables -> agent defaultValue
        if (val === undefined || val === "") {
          if (variableOverrides[varKey] !== undefined) {
            val = variableOverrides[varKey];
          } else if (campaignVariables[varKey] !== undefined) {
            val = campaignVariables[varKey];
          } else {
            val = agentVarMap.get(varKey)?.defaultValue ?? "";
          }
        }

        rowValues.push(val);
      }

      dataRows.push(rowValues);
    }

    const csvContent = serializeCsv(headers, dataRows);
    const transformedCsvBuffer = Buffer.from(csvContent, "utf-8");

    // 6. Build transformation JSON
    const appVariablesMap: Record<
      string,
      { column_name: string; required: boolean; formatting_functions: unknown[] }
    > = {};

    for (const varKey of matchedVariables) {
      appVariablesMap[varKey] = {
        column_name: varKey,
        required: false,
        formatting_functions: [],
      };
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
      app_overrides: {},
      alternate_phone_numbers: [],
    };

    return {
      transformedCsvBuffer,
      transformationJson,
      matchedVariables,
      missingRequiredVariables,
      totalLeads: dataRows.length,
    };
  }
}
