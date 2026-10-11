import type { LeadRow } from "../../infrastructure/leadParser";

export interface InFileDedupResult {
  uniqueRows: LeadRow[];
  duplicatePhones: string[];
}

export interface CrossBatchDedupResult {
  newLeads: LeadRow[];
  duplicatePhones: string[];
}

/**
 * Deduplicates parsed lead rows in-memory within a single uploaded batch/file.
 * Preserves the first row encountered for each unique phone number.
 */
export function deduplicateInFileLeads(rows: LeadRow[]): InFileDedupResult {
  const seenInFile = new Set<string>();
  const duplicatePhones: string[] = [];
  const uniqueRows: LeadRow[] = [];

  for (const row of rows) {
    if (seenInFile.has(row.phone)) {
      duplicatePhones.push(row.phone);
    } else {
      seenInFile.add(row.phone);
      uniqueRows.push(row);
    }
  }

  return { uniqueRows, duplicatePhones };
}

/**
 * Filters out leads whose phone numbers already exist in previously processed batches for the campaign.
 */
export function deduplicateCrossBatchLeads(
  rows: LeadRow[],
  existingPhones: Set<string>,
): CrossBatchDedupResult {
  const newLeads: LeadRow[] = [];
  const duplicatePhones: string[] = [];

  for (const row of rows) {
    if (existingPhones.has(row.phone)) {
      duplicatePhones.push(row.phone);
    } else {
      newLeads.push(row);
    }
  }

  return { newLeads, duplicatePhones };
}
