import type { BatchStatus } from "@prisma/client";

/**
 * Evaluates the reconciled CampaignStatus given the statuses of all its batches.
 *
 * Domain Rules:
 * 1. If any batch is actively executing or scheduled (RUNNING, SCHEDULED, PROCESSING),
 *    the campaign remains RUNNING (cannot transition to terminal state).
 * 2. If any batch is unstarted (CREATED), the campaign remains RUNNING because
 *    pending work has not yet been executed.
 * 3. When NO active batches and NO unstarted (CREATED) batches exist:
 *    - If all executed batches are FAILED, the campaign transitions to FAILED.
 *    - If at least one executed batch is COMPLETED or STOPPED, the campaign transitions to COMPLETED.
 * 4. If there are no batches at all, returns null (delegates to legacy lead-level checks).
 *
 * @returns "COMPLETED" | "FAILED" | "RUNNING", or null if no batches exist.
 */
export function evaluateCampaignStatusFromBatches(
  statuses: BatchStatus[],
): "COMPLETED" | "FAILED" | "RUNNING" | null {
  if (statuses.length === 0) {
    return null;
  }

  // 1. Any active batches currently dialing or scheduled
  const hasActiveBatches = statuses.some(
    (s) => s === "RUNNING" || s === "SCHEDULED" || s === "PROCESSING",
  );
  if (hasActiveBatches) {
    return "RUNNING";
  }

  // 2. Any unstarted batches waiting to run
  const hasUnstartedBatches = statuses.some((s) => s === "CREATED");
  if (hasUnstartedBatches) {
    return "RUNNING";
  }

  // 3. All batches have executed (COMPLETED, FAILED, STOPPED)
  const allFailed = statuses.every((s) => s === "FAILED");
  return allFailed ? "FAILED" : "COMPLETED";
}

/**
 * The single campaign-status decision used by every finalizer.
 *
 * The decision deliberately does not read the current campaign status. Both
 * writes are performed with an atomic status guard in the database, so a
 * terminal campaign (COMPLETED, FAILED, CANCELLED, PAUSED) is never
 * resurrected or overwritten by a late webhook, even when a stale read raced
 * with a concurrent finalization.
 */
export type CampaignStatusDecision =
  | { action: "none" }
  | { action: "mark-running" }
  | { action: "settle"; status: "COMPLETED" | "FAILED" };

export function decideCampaignStatusFromBatches(
  statuses: BatchStatus[],
): CampaignStatusDecision {
  const desired = evaluateCampaignStatusFromBatches(statuses);
  if (!desired) {
    return { action: "none" };
  }

  if (desired === "RUNNING") {
    return { action: "mark-running" };
  }

  return { action: "settle", status: desired };
}
