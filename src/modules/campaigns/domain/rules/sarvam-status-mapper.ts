// modules/campaigns/domain/rules/sarvam-status-mapper.ts

import type { CampaignStatus, BatchStatus } from "@prisma/client";

/**
 * Maps a native Sarvam Campaign status string to Kooi's CampaignStatus enum.
 * Native Sarvam campaign statuses:
 *  - "scheduled" -> SCHEDULED
 *  - "active"    -> RUNNING
 *  - "paused"    -> PAUSED
 *  - "ended"     -> COMPLETED
 *  - "cancelled" -> CANCELLED
 */
export function mapSarvamCampaignStatusToKooi(
  sarvamStatus: string,
): CampaignStatus {
  switch (sarvamStatus.toLowerCase().trim()) {
    case "scheduled":
      return "SCHEDULED";
    case "active":
      return "RUNNING";
    case "paused":
      return "PAUSED";
    case "ended":
      return "COMPLETED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "RUNNING";
  }
}

/**
 * Maps a native Sarvam Cohort status string to Kooi's BatchStatus enum.
 * Documented Sarvam cohort statuses:
 *  - "processing" -> PROCESSING
 *  - "completed"  -> CREATED (contact ingestion finished, ready for campaign dials)
 *  - "failed"     -> FAILED
 */
export function mapSarvamCohortStatusToKooi(cohortStatus: string): BatchStatus {
  switch (cohortStatus.toLowerCase().trim()) {
    case "processing":
      return "PROCESSING";
    case "completed":
      return "CREATED";
    case "failed":
      return "FAILED";
    default:
      return "PROCESSING";
  }
}

