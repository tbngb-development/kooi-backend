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
