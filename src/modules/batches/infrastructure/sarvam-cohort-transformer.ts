import { normalizePhoneNumber } from "../../leads/domain/rules/phone.rules";
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
    const agentVarMap = new Map<string, SarvamAgentVariable>();
    for (const v of agentVariables) {
      agentVarMap.set(v.key, v);
    }

    // Lead CSV upload strictly requires contact number only.
    // All defined agent variables are included and injected from campaign variables,
    // overrides, defaults, or fallback to empty string ("").
    const matchedVariables: string[] = agentVariables.map((v) => v.key);
    const missingRequiredVariables: string[] = [];

    // Construct CSV headers: ["contact_number", ...matchedVariables]
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

        // 1. Try exact match on lead row
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

        // 2. Fallbacks: campaignVariables -> variableOverrides -> agent defaultValue -> ""
        if (val === undefined || val === "") {
          if (campaignVariables[varKey] !== undefined && campaignVariables[varKey] !== "") {
            val = campaignVariables[varKey];
          } else if (variableOverrides[varKey] !== undefined && variableOverrides[varKey] !== "") {
            val = variableOverrides[varKey];
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

    // Build transformation JSON
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
