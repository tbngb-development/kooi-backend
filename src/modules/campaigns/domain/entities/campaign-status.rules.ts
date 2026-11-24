import type { CampaignStatus } from "@prisma/client";

/**
 * Valid status transitions for Campaign.
 *
 * DRAFT ──────→ SCHEDULED / RUNNING / FAILED / CANCELLED
 * SCHEDULED ──→ RUNNING / PAUSED / CANCELLED / FAILED
 * RUNNING ────→ COMPLETED / FAILED / DRAFT / PAUSED / CANCELLED
 * PAUSED ─────→ RUNNING / CANCELLED / FAILED / COMPLETED
 */
const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["SCHEDULED", "RUNNING", "FAILED", "CANCELLED"],
  SCHEDULED: ["RUNNING", "PAUSED", "CANCELLED", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED", "DRAFT", "PAUSED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED", "FAILED", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
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
