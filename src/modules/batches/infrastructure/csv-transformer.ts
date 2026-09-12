import { normalizePhoneNumber } from "../../leads/domain/rules/phone.rules";
import type { LeadRow } from "../../leads/infrastructure/leadParser";

export interface CSVTransformResult {
  transformedBuffer: Buffer;
  validCount: number;
  filteredOutCount: number;
}

/**
 * Converts parsed lead rows into a Bolna-compatible CSV buffer.
 *
 * Normalizations applied:
 * 1. Forces E.164 phone format with +91 prefix
 * 2. Drops non-Indian numbers
 * 3. Renames "phone" → "contact_number"
 * 4. Injects campaign variables into columns
 * 5. Generates a dynamic "welcome_message" column based on name availability
 */
export function transformToBolnaCSV(
  leads: LeadRow[],
  campaignVariables: Record<string, string>,
): CSVTransformResult {
  // Enforce "welcome_message" as a permanent header
  const headers = new Set<string>([
    "contact_number",
    "customer_name",
    "welcome_message",
  ]);

  // Extract non-standard columns from lead data, excluding keys we normalize
  for (const lead of leads) {
    for (const key of Object.keys(lead)) {
      if (
        !["phone", "name", "email", "company", "welcome_message"].includes(key)
      ) {
        headers.add(key);
      }
    }
  }

  // Extract keys from campaign variables, avoiding duplicates or naming collisions
  for (const vKey of Object.keys(campaignVariables)) {
    if (
      !["customer_name", "customer_phone", "phone", "welcome_message"].includes(
        vKey,
      )
    ) {
      headers.add(vKey);
    }
  }

  const headerArray = Array.from(headers);
  const rows: string[][] = [headerArray];
  let validCount = 0;
  let filteredOutCount = 0;

  // Safe fallbacks in case variables are missing
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

    // Evaluate if the customer name is valid and conversational
    const callName = lead.name?.trim() || "";
    const hasCustomerName =
      !!callName &&
      !["unknown", "null", "unavailable", "undefined", ""].includes(
        callName.toLowerCase(),
      );

    // Compute welcome_message dynamically
    const welcomeMessage = hasCustomerName
      ? `Hi, am I speaking with ${callName}?`
      : `Hi, I'm ${agentName} from ${builderName}. Is this a good time to talk?`;

    for (const header of headerArray) {
      if (header === "contact_number") {
        rowData.push(normalizedPhone);
      } else if (header === "customer_name") {
        rowData.push(lead.name || "");
      } else if (header === "welcome_message") {
        // Must escape double quotes for CSV safety
        rowData.push(`"${welcomeMessage.replace(/"/g, '""')}"`);
      } else {
        const value =
          lead[header] !== undefined
            ? String(lead[header] ?? "")
            : String(campaignVariables[header] ?? "");
        rowData.push(`"${value.replace(/"/g, '""')}"`);
      }
    }

    rows.push(rowData);
  }

  const csvContent = rows.map((r) => r.join(",")).join("\n");
  const transformedBuffer = Buffer.from(csvContent, "utf-8");

  return { transformedBuffer, validCount, filteredOutCount };
}
