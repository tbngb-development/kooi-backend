import type { BatchStatus } from "@prisma/client";

/**
 * Valid status transitions for LeadBatch.
 *
 * Full Lifecycle:
 *
 * 1. Upload & Background Processing:
 *    CREATED ─────→ PROCESSING   (uploaded & enqueued for worker)
 *    CREATED ─────→ FAILED       (pre-validation or file upload failed)
 *
 * 2. Worker Processing Completion:
 *    PROCESSING ──→ CREATED      (staged in Bolna, awaiting manual run/schedule)
 *    PROCESSING ──→ SCHEDULED    (scheduled for future execution)
 *    PROCESSING ──→ RUNNING      (runImmediately was requested)
 *    PROCESSING ──→ FAILED       (parse error, 100% duplicates, plan cap, or Bolna API failure)
 *
 * 3. Execution & Runtime Webhooks:
 *    SCHEDULED ───→ RUNNING      (Bolna started dialing / scheduled time reached)
 *    SCHEDULED ───→ STOPPED      (manually stopped before execution)
 *    SCHEDULED ───→ FAILED       (Bolna scheduling failed)
 *    RUNNING ─────→ COMPLETED    (all leads processed to terminal state)
 *    RUNNING ─────→ STOPPED      (manually halted mid-batch or stopped on low balance)
 *    RUNNING ─────→ FAILED       (unrecoverable calling failure)
 *
 * 4. Terminal & Resume:
 *    STOPPED ─────→ COMPLETED    (reassigned leads finished in resume batch)
 */
const VALID_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  CREATED: ["PROCESSING", "SCHEDULED", "RUNNING", "FAILED"],
  PROCESSING: ["CREATED", "SCHEDULED", "RUNNING", "FAILED"],
  SCHEDULED: ["RUNNING", "STOPPED", "FAILED"],
  RUNNING: ["COMPLETED", "STOPPED", "FAILED"],
  STOPPED: ["COMPLETED", "RUNNING"],
  COMPLETED: ["RUNNING"],
  FAILED: [],
};

/**
 * Checks whether a transition from one BatchStatus to another is allowed.
 * Identity transitions (same -> same) are always valid (idempotent).
 */
export function canTransitionBatchStatus(
  from: BatchStatus,
  to: BatchStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Checks if a batch is in an active dialing or queued-to-dial state.
 */
export function isBatchActive(status: BatchStatus): boolean {
  return status === "SCHEDULED" || status === "RUNNING";
}

/**
 * Checks if a batch is currently being processed in the background worker queue.
 */
export function isBatchProcessing(status: BatchStatus): boolean {
  return status === "PROCESSING";
}

/**
 * Checks if a batch has reached a permanent terminal state.
 */
export function isBatchTerminal(status: BatchStatus): boolean {
  return status === "COMPLETED" || status === "STOPPED" || status === "FAILED";
}