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

/**
 * Maps the last retry status from a scheduled webhook into the appropriate LeadStatus.
 */
export function mapLastRetryToLeadStatus(rawStatus?: string | null): LeadStatus {
  if (!rawStatus) return "FAILED";
  const normalized = rawStatus.toLowerCase();
  if (normalized === "busy") return "BUSY";
  if (normalized === "no-answer" || normalized === "no_answer") return "NO_ANSWER";
  return "FAILED";
}

/**
 * Maps the last retry status from a scheduled webhook into the appropriate CallStatus.
 */
export function mapRetryStatusToCallStatus(rawStatus?: string | null): CallStatus {
  if (!rawStatus) return "FAILED";
  const normalized = rawStatus.toLowerCase();
  if (normalized.includes("busy")) return "BUSY";
  if (normalized.includes("no-answer") || normalized.includes("no_answer")) return "NO_ANSWER";
  if (normalized.includes("completed")) return "COMPLETED";
  return "FAILED";
}
