import type { ManualLeadInput } from "../application/dto/batch.dto";
import { serializeCsv } from "../../../shared/utils/csv";

/**
 * Serializes manually entered leads into a CSV buffer compatible with
 * the existing parseLeadBuffer → worker pipeline.
 *
 * Headers use the canonical alias names that leadParser recognizes:
 *   contact_number, customer_name
 */
export function serializeManualLeadsToCSV(leads: ManualLeadInput[]): Buffer {
  const headers = ["contact_number", "customer_name"];
  const rows = leads.map((lead) => [
    lead.contact_number.trim(),
    (lead.customer_name ?? "").trim(),
  ]);

  const csvContent = serializeCsv(headers, rows);
  return Buffer.from(csvContent, "utf-8");
}
