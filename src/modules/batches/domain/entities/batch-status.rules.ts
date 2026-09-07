import type { BatchStatus } from "@prisma/client";

/**
 * Valid status transitions for LeadBatch.
 *
 * CREATED ────→ SCHEDULED    (run/schedule dispatched to Bolna)
 * SCHEDULED ──→ RUNNING      (first call webhook received)
 * SCHEDULED ──→ STOPPED      (manually halted before dispatch)
 * RUNNING ────→ COMPLETED    (all leads terminal)
 * RUNNING ────→ STOPPED      (manually halted mid-dispatch)
 * RUNNING ────→ FAILED       (Bolna error)
 * STOPPED ────→ COMPLETED    (after resume batch finishes remaining)
 * CREATED ────→ FAILED       (Bolna batch creation failed)
 */
const VALID_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  CREATED: ["SCHEDULED", "FAILED"],
  SCHEDULED: ["RUNNING", "STOPPED"],
  RUNNING: ["COMPLETED", "STOPPED", "FAILED"],
  STOPPED: ["COMPLETED"],
  COMPLETED: [],
  FAILED: [],
};

export function canTransitionBatchStatus(
  from: BatchStatus,
  to: BatchStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isBatchActive(status: BatchStatus): boolean {
  return status === "SCHEDULED" || status === "RUNNING";
}

export function isBatchTerminal(status: BatchStatus): boolean {
  return status === "COMPLETED" || status === "STOPPED" || status === "FAILED";
}
