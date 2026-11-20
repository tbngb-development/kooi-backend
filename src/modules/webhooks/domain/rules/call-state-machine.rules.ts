import type { CallStatus } from "@prisma/client";

const TERMINAL_CALL_STATUSES = new Set<CallStatus>([
  "COMPLETED",
  "FAILED",
  "STOPPED",
  "NO_ANSWER",
  "BUSY",
]);

/**
 * Checks if a call status is terminal (cannot transition back to active/in-progress states).
 */
export function isTerminalCallStatus(status: CallStatus): boolean {
  return TERMINAL_CALL_STATUSES.has(status);
}

/**
 * Whether a completion event may still be applied to a call in `status`.
 *
 * A late completion must not overwrite a different terminal outcome — most
 * importantly a call stopped by credit enforcement, but also NO_ANSWER/BUSY/
 * FAILED. Replaying an already COMPLETED call remains allowed: the webhook
 * controller returns 500 when a downstream step throws, so the provider retry
 * has to re-run the completion path (the wallet debit is idempotent).
 */
export function canApplyCallCompletion(status: CallStatus): boolean {
  return !isTerminalCallStatus(status) || status === "COMPLETED";
}

/**
 * Validates whether transitioning from currentStatus to nextStatus is permissible.
 * Specifically prevents out-of-order webhooks (e.g. late 'ringing' or 'calling' events)
 * from regressing calls that have already reached a terminal state.
 */
export function canTransitionCallStatus(
  currentStatus: CallStatus,
  nextStatus: CallStatus,
): boolean {
  if (currentStatus === nextStatus) return true;

  // Once completed or stopped, a call cannot regress to calling or scheduled
  if (currentStatus === "COMPLETED" || currentStatus === "STOPPED") {
    return false;
  }

  // Non-answer, busy, or failed cannot regress to in-flight or scheduled states
  if (
    (currentStatus === "NO_ANSWER" ||
      currentStatus === "BUSY" ||
      currentStatus === "FAILED") &&
    (nextStatus === "CALLING" || nextStatus === "PENDING" || nextStatus === "SCHEDULED")
  ) {
    return false;
  }

  return true;
}
