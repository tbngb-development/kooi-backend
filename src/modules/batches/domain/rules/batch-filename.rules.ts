/**
 * Domain rules and utilities for generating standardized, traceable
 * Bolna CSV upload filenames.
 *
 * Format:
 * batch-{batch-count}-{lead-batch-id}-{campaign-id}.csv
 * Example:
 * batch-03-lb_8f21e54a-cmp_a91d034b.csv
 */

/**
 * Shortens an entity identifier (such as a UUID) and prefixes it with the domain namespace.
 * Strips existing prefixes, hyphens, and whitespace, extracting the first `length` characters.
 *
 * @param id The raw entity ID (UUID or prefixed string)
 * @param prefix Namespace prefix ('lb' for lead batch, 'cmp' for campaign)
 * @param length Target character length (default 8 for 4.3 billion unique values)
 */
export function shortenEntityId(
  id: string,
  prefix: "lb" | "cmp",
  length = 8,
): string {
  if (!id || typeof id !== "string") {
    return `${prefix}_unknown`;
  }

  // Remove existing prefix if already present (e.g. "lb_" or "cmp_")
  let cleaned = id.trim().replace(/^(lb_|cmp_)/i, "");

  // Remove dashes and non-alphanumeric characters
  cleaned = cleaned.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  const shortened = cleaned.slice(0, length);
  return `${prefix}_${shortened || "unknown"}`;
}

/**
 * Formats a sequential batch number with zero-padding for single-digit numbers.
 * Examples:
 * 1 -> "01"
 * 9 -> "09"
 * 10 -> "10"
 * 105 -> "105"
 */
export function formatBatchSequence(sequence: number): string {
  const safeNumber = Math.max(1, Math.floor(sequence || 1));
  return String(safeNumber).padStart(2, "0");
}

export interface GenerateBolnaBatchFilenameParams {
  batchSequence: number;
  batchId: string;
  campaignId: string;
  idLength?: number;
}

/**
 * Generates a standardized, deterministic filename for CSV uploads to Bolna.
 *
 * Format:
 * `batch-{batch-count}-{lead-batch-id}-{campaign-id}.csv`
 * Example:
 * `batch-03-lb_8f21e54a-cmp_a91d034b.csv`
 */
export function generateBolnaBatchFilename(
  params: GenerateBolnaBatchFilenameParams,
): string {
  const formattedCount = formatBatchSequence(params.batchSequence);
  const shortBatchId = shortenEntityId(
    params.batchId,
    "lb",
    params.idLength ?? 8,
  );
  const shortCampaignId = shortenEntityId(
    params.campaignId,
    "cmp",
    params.idLength ?? 8,
  );

  return `batch-${formattedCount}-${shortBatchId}-${shortCampaignId}.csv`;
}

export interface ParsedBolnaBatchFilename {
  batchSequence: number;
  shortBatchId: string;
  shortCampaignId: string;
}

/**
 * Parses and validates a standardized Bolna batch filename.
 * Returns null if the filename does not strictly adhere to the convention.
 */
export function parseBolnaBatchFilename(
  filename: string,
): ParsedBolnaBatchFilename | null {
  if (!filename || typeof filename !== "string") return null;

  const match = /^batch-(\d+)-(lb_[0-9a-zA-Z]+)-(cmp_[0-9a-zA-Z]+)\.csv$/.exec(
    filename.trim(),
  );
  if (!match) return null;

  return {
    batchSequence: parseInt(match[1], 10),
    shortBatchId: match[2],
    shortCampaignId: match[3],
  };
}
