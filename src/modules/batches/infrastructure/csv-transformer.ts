import {
  cleanCustomerName,
  isValidCustomerName,
} from "../../leads/domain/rules/name.rules";
import { normalizePhoneNumber } from "../../leads/domain/rules/phone.rules";
import {
  NAME_ALIASES,
  PHONE_ALIASES,
  type LeadRow,
} from "../../leads/infrastructure/leadParser";
import { serializeCsv } from "../../../shared/utils/csv";

export interface CSVTransformResult {
  transformedBuffer: Buffer;
  validCount: number;
  filteredOutCount: number;
}

const RESERVED_OR_ALIAS_HEADERS = new Set([
  ...NAME_ALIASES,
  ...PHONE_ALIASES,
  "name",
  "phone",
  "email",
  "email_address",
  "company",
  "welcome_message",
  "contact_number",
  "customer_name",
]);

/**
 * Converts parsed lead rows into a Bolna-compatible CSV buffer.
 */
export function transformToBolnaCSV(
  leads: LeadRow[],
  campaignVariables: Record<string, string>,
): CSVTransformResult {
  // Target Bolna headers
  const headers = new Set<string>([
    "contact_number",
    "customer_name",
    "welcome_message",
  ]);

  // Extract non-standard columns from lead data without adding duplicate alias columns
  for (const lead of leads) {
    for (const key of Object.keys(lead)) {
      if (!RESERVED_OR_ALIAS_HEADERS.has(key.toLowerCase())) {
        headers.add(key);
      }
    }
  }

  // Extract campaign variables
  for (const vKey of Object.keys(campaignVariables)) {
    if (!RESERVED_OR_ALIAS_HEADERS.has(vKey.toLowerCase())) {
      headers.add(vKey);
    }
  }

  const headerArray = Array.from(headers);
  const dataRows: string[][] = [];
  let validCount = 0;
  let filteredOutCount = 0;

  const agentName = campaignVariables.agent_name || "Sara";
  const builderName = campaignVariables.builder_name || "Unavailable";

  for (const lead of leads) {
    const normalizedPhone = normalizePhoneNumber(lead.phone);

    if (!normalizedPhone.startsWith("+91")) {
      filteredOutCount++;
      continue;
    }

    validCount++;
    const rowData: string[] = [];

    const formattedName = cleanCustomerName(lead.name);
    const hasCustomerName = Boolean(
      formattedName && isValidCustomerName(formattedName),
    );

    // Dynamic welcome message
    const welcomeMessage = hasCustomerName
      ? `Hi, am I speaking with ${formattedName}?`
      : `Hi, I'm ${agentName} from ${builderName}. Is this a good time to talk?`;

    for (const header of headerArray) {
      if (header === "contact_number") {
        rowData.push(normalizedPhone);
      } else if (header === "customer_name") {
        rowData.push(hasCustomerName ? formattedName : "");
      } else if (header === "welcome_message") {
        rowData.push(welcomeMessage);
      } else {
        const value =
          lead[header] !== undefined
            ? String(lead[header] ?? "")
            : String(campaignVariables[header] ?? "");
        rowData.push(value);
      }
    }

    dataRows.push(rowData);
  }

  const csvContent = serializeCsv(headerArray, dataRows);
  const transformedBuffer = Buffer.from(csvContent, "utf-8");

  return { transformedBuffer, validCount, filteredOutCount };
}
