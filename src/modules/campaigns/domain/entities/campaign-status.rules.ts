import type { CampaignStatus } from "@prisma/client";

/**
 * Valid status transitions for Campaign.
 *
 * DRAFT ──────→ RUNNING      (first batch scheduled)
 * RUNNING ────→ COMPLETED    (all batches terminal)
 * RUNNING ────→ FAILED       (all batches failed)
 * RUNNING ────→ DRAFT        (all batches stopped, no active remain)
 * DRAFT ──────→ FAILED       (batch creation failure propagated)
 */
const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["RUNNING", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED", "DRAFT"],
  COMPLETED: [],
  FAILED: [],
};

export function canTransitionCampaignStatus(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidCampaignTransitions(
  from: CampaignStatus,
): CampaignStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}
