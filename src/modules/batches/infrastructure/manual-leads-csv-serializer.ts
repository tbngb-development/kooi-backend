import type { ManualLeadInput } from "../application/dto/batch.dto";

/**
 * Serializes manually entered leads into a CSV buffer compatible with
 * the existing parseLeadBuffer → worker pipeline.
 *
 * Headers use the canonical alias names that leadParser recognizes:
 *   contact_number, customer_name
 */
export function serializeManualLeadsToCSV(leads: ManualLeadInput[]): Buffer {
  const headers = ["contact_number", "customer_name"];
  const rows: string[][] = [headers];

  for (const lead of leads) {
    const phone = lead.contact_number.trim();
    const name = (lead.customer_name ?? "").trim().replace(/"/g, '""');
    rows.push([phone, `"${name}"`]);
  }

  const csvContent = rows.map((r) => r.join(",")).join("\n");
  return Buffer.from(csvContent, "utf-8");
}
