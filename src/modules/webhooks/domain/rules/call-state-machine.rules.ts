import type { CallStatus } from "@prisma/client";

const TERMINAL_CALL_STATUSES = new Set<CallStatus>([
  "COMPLETED",
  "FAILED",
  "STOPPED",
  "NO_ANSWER",
  "BUSY",
]);

const RETRYABLE_TERMINAL_CALL_STATUSES = new Set<CallStatus>([
  "NO_ANSWER",
  "BUSY",
  "FAILED",
]);

export interface CallTransitionContext {
  currentAttempt?: number;
  incomingAttempt?: number;
}

/**
 * Checks if a call status is terminal (cannot transition back to active/in-progress states).
 */
export function isTerminalCallStatus(status: CallStatus): boolean {
  return TERMINAL_CALL_STATUSES.has(status);
}

/**
 * Terminal outcomes that Bolna may retry. COMPLETED and STOPPED are final;
 * NO_ANSWER, BUSY and FAILED can be superseded by a higher retry attempt.
 */
export function isRetryableTerminalCallStatus(status: CallStatus): boolean {
  return RETRYABLE_TERMINAL_CALL_STATUSES.has(status);
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
 *
 * Identical terminal replays remain allowed. A retryable terminal disposition
 * (NO_ANSWER/BUSY/FAILED) may only be superseded when the incoming event carries
 * a strictly higher attempt number; otherwise a stale/duplicate webhook could
 * overwrite the actual outcome. COMPLETED and STOPPED are always final.
 */
export function canTransitionCallStatus(
  currentStatus: CallStatus,
  nextStatus: CallStatus,
  context: CallTransitionContext = {},
): boolean {
  if (currentStatus === nextStatus) return true;

  if (currentStatus === "COMPLETED" || currentStatus === "STOPPED") {
    return false;
  }

  if (nextStatus === "PENDING") return false;

  if (isRetryableTerminalCallStatus(currentStatus)) {
    const { currentAttempt, incomingAttempt } = context;
    const isHigherRetryAttempt =
      typeof currentAttempt === "number" &&
      typeof incomingAttempt === "number" &&
      incomingAttempt > currentAttempt;

    return isHigherRetryAttempt;
  }

  return true;
}
