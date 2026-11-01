// modules/batches/domain/rules/bolna-filename.rules.ts

export interface BolnaFilenameParams {
  sequenceNumber: number;
  batchId: string;
  campaignName?: string;
  campaignId?: string;
}

/**
 * Formats a 1-based sequential batch number into an uppercase 3-digit zero-padded BTH string.
 * Example: 1 -> 'BTH001', 12 -> 'BTH012', 100 -> 'BTH100', 1000 -> 'BTH1000'.
 *
 * @throws Error if sequenceNumber is not a positive integer (>= 1).
 */
export function formatBatchSequence(sequenceNumber: number): string {
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new Error(
      `Batch sequence number must be a positive integer, received: ${sequenceNumber}`,
    );
  }
  return `BTH${String(sequenceNumber).padStart(3, "0")}`;
}

/**
 * Shortens an entity UUID or ID into a clean, collision-resistant identifier.
 * Strips hyphens and non-alphanumeric characters, converts to lowercase,
 * and takes the first `length` characters (default 8).
 *
 * @param id The entity ID (e.g. UUID)
 * @param prefix Identifier prefix ('lb' for lead batch, 'cmp' for campaign)
 * @param length Character length to extract (default 8)
 * @throws Error if id is empty or does not yield enough characters
 */
export function shortenEntityId(
  id: string,
  prefix: "lb" | "cmp",
  length = 8,
): string {
  if (!id || typeof id !== "string") {
    throw new Error(`Invalid ${prefix} ID: ID must be a non-empty string`);
  }

  // Remove hyphens, underscores, whitespace
  const sanitized = id.replace(/[-_\s]/g, "").toLowerCase();

  if (sanitized.length < 4) {
    throw new Error(
      `Entity ID "${id}" is too short to produce a unique identifier (minimum 4 characters required)`,
    );
  }

  const shortPart = sanitized.slice(0, length);
  return `${prefix}_${shortPart}`;
}

/**
 * Sanitizes and slugifies a campaign name for safe URL, multipart, and filename usage.
 * Converts to lowercase, replaces non-alphanumeric characters with hyphens, trims dashes,
 * and truncates to a maximum of 40 characters.
 *
 * Falls back to `cmp_<shortId>` or 'campaign' if the name yields no alphanumeric characters.
 */
export function slugifyCampaignName(name?: string, fallbackId?: string): string {
  if (!name || typeof name !== "string") {
    return fallbackId ? shortenEntityId(fallbackId, "cmp", 8) : "campaign";
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

  if (!slug || slug.length === 0) {
    return fallbackId ? shortenEntityId(fallbackId, "cmp", 8) : "campaign";
  }

  return slug;
}

/**
 * Generates the standardized batch display name for database records and UI display.
 * Convention:
 *   BTH{seq3digits}-{campaignName}-{lead_batch_id}
 *
 * Example:
 *   BTH001-winter-sale-2026-lb_8f21e4b3
 */
export function generateBatchDisplayName(params: BolnaFilenameParams): string {
  const bthSeq = formatBatchSequence(params.sequenceNumber);
  const slugCampaign = slugifyCampaignName(params.campaignName, params.campaignId);
  const shortBatchId = shortenEntityId(params.batchId, "lb", 8);

  return `${bthSeq}-${slugCampaign}-${shortBatchId}`;
}

/**
 * Generates a standardized, traceable filename for CSV uploads to Bolna.
 * Convention:
 *   BTH{seq3digits}-{campaignName}-{lead_batch_id}.csv
 *
 * Example:
 *   BTH001-winter-sale-2026-lb_8f21e4b3.csv
 *
 * @throws Error if sequence number, batch ID, or generated filename are invalid.
 */
export function generateBolnaBatchFilename(params: BolnaFilenameParams): string {
  const baseName = generateBatchDisplayName(params);
  const filename = `${baseName}.csv`;

  // Filename constraint check: BTH followed by digits, slugified name, lb_<shortId>, ending with .csv
  const validPattern = /^BTH\d{3,}-[a-z0-9-]+-lb_[a-z0-9]{4,16}\.csv$/;
  if (!validPattern.test(filename)) {
    throw new Error(`Generated invalid Bolna batch filename: "${filename}"`);
  }

  return filename;
}
