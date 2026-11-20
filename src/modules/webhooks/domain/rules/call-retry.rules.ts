import type { CallStatus, LeadStatus } from "@prisma/client";
import type { RetryConfig } from "../../../../shared/types/bolna.types";

export interface EvaluateCallRetryInput {
  isBatchStopped: boolean;
  retryConfig?: RetryConfig | null;
  currentAttempts: number;
  status: "NO_ANSWER" | "BUSY" | "FAILED";
}

export interface EvaluateCallRetryResult {
  willRetry: boolean;
  finalCallStatus: CallStatus;
  leadStatus: LeadStatus;
}

export interface BolnaRetryEventLike {
  retry_count?: number | null;
  retry_history?: ReadonlyArray<{
    attempt?: number | null;
    status?: string | null;
  }> | null;
  batch_run_details?: {
    retried?: number | null;
  } | null;
}

export interface CallHistoryLike {
  callHistory?: unknown[] | null;
}

/**
 * Pure domain rules evaluating whether a non-answering/busy/failed call should
 * be scheduled for retry or transitioned to a terminal state.
 */
export function evaluateCallRetry(
  input: EvaluateCallRetryInput,
): EvaluateCallRetryResult {
  const { isBatchStopped, retryConfig, currentAttempts, status } = input;

  const retryEnabled = Boolean(retryConfig?.enabled);
  const retryStatuses = retryConfig?.retry_on_statuses ?? [
    "no-answer",
    "busy",
    "failed",
  ];
  const maxRetries = retryConfig?.max_retries ?? 0;

  const statusKey =
    status === "NO_ANSWER"
      ? "no-answer"
      : status === "BUSY"
        ? "busy"
        : "failed";

  const willRetry =
    !isBatchStopped &&
    retryEnabled &&
    currentAttempts < maxRetries &&
    retryStatuses.includes(statusKey);

  // A call that terminated with BUSY, NO_ANSWER, or FAILED retains its true terminal disposition
  const finalCallStatus: CallStatus = status;

  let leadStatus: LeadStatus;
  if (retryEnabled) {
    leadStatus =
      status === "BUSY"
        ? "BUSY"
        : status === "FAILED"
          ? "FAILED"
          : "NO_ANSWER";
  } else {
    leadStatus = "CALLED";
  }

  return {
    willRetry,
    finalCallStatus,
    leadStatus,
  };
}

function normalizeRetryStatus(rawStatus?: string | null): string {
  return (rawStatus ?? "").toLowerCase().trim().replace(/_/g, "-");
}

/**
 * Maps a Bolna execution status into the corresponding CallStatus.
 * Scheduled/rescheduled statuses represent a retry that has not dialed yet.
 */
export function mapRetryStatusToCallStatus(rawStatus?: string | null): CallStatus {
  const normalized = normalizeRetryStatus(rawStatus);
  if (
    normalized === "scheduled" ||
    normalized === "rescheduled" ||
    normalized === "re-scheduled"
  ) {
    return "SCHEDULED";
  }
  if (normalized.includes("busy")) return "BUSY";
  if (normalized.includes("no-answer") || normalized.includes("no_answer")) return "NO_ANSWER";
  if (normalized.includes("completed")) return "COMPLETED";
  return "FAILED";
}

/**
 * Maps a Bolna execution status into the corresponding LeadStatus.
 * A scheduled retry means no dial happened, so the lead returns to PENDING.
 */
export function mapLastRetryToLeadStatus(rawStatus?: string | null): LeadStatus {
  const normalized = normalizeRetryStatus(rawStatus);
  if (
    normalized === "scheduled" ||
    normalized === "rescheduled" ||
    normalized === "re-scheduled"
  ) {
    return "PENDING";
  }
  if (normalized === "busy") return "BUSY";
  if (normalized === "no-answer" || normalized === "no_answer") return "NO_ANSWER";
  return "FAILED";
}

/**
 * Attempt number carried by a webhook, 1-based.
 *
 * retry_count is primary ("attempts so far", 0 for the first attempt).
 * retry_history is a cross-check/fallback only. Schedule timestamps are
 * deliberately ignored because they do not identify event order.
 */
export function getBolnaEventAttempt(payload: BolnaRetryEventLike): number {
  const retryCount = payload.retry_count ?? payload.batch_run_details?.retried;
  if (typeof retryCount === "number" && Number.isFinite(retryCount)) {
    return Math.max(1, Math.trunc(retryCount) + 1);
  }

  const history = Array.isArray(payload.retry_history)
    ? payload.retry_history
    : [];
  const attempts = history
    .map((entry, index) =>
      typeof entry?.attempt === "number" && Number.isFinite(entry.attempt)
        ? Math.trunc(entry.attempt)
        : index + 1,
    )
    .filter((attempt) => attempt > 0);

  return attempts.length > 0 ? Math.max(...attempts) : 1;
}

/**
 * Highest attempt already persisted for a call. DB updatedAt is only a
 * tiebreaker inside an attempt; attempt ordering comes from callHistory.
 */
export function getCallRecordAttempt(call: CallHistoryLike): number {
  const history = Array.isArray(call.callHistory) ? call.callHistory : [];
  const attempts = history
    .map((entry, index) => {
      const attempt = (entry as { attempt?: unknown } | null)?.attempt;
      if (typeof attempt === "number" && Number.isFinite(attempt)) {
        return Math.trunc(attempt);
      }
      return index + 1;
    })
    .filter((attempt) => attempt > 0);

  return attempts.length > 0 ? Math.max(...attempts) : 0;
}
