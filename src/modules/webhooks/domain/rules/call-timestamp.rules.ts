import type { WebhookCallPayload } from "../../application/dto/webhook.dto";

/**
 * Safely parses an ISO date string from Bolna payloads into a UTC Date object.
 * If the string omits a timezone designator, it is treated as UTC.
 */
export function parseBolnaTimestamp(raw?: string | null): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  // If string format is YYYY-MM-DDTHH:mm:ss(.sss) without Z or +/- offset, append Z for UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
    normalized += "Z";
  }

  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolves the actual start time for a call or retry attempt.
 * Priority:
 * 1. If this is an existing in-flight attempt (not a new attempt) and currentStartedAt is set, preserve it.
 * 2. payload.initiated_at
 * 3. payload.telephony_data?.start_time
 * 4. payload.created_at
 * 5. payload.at
 * 6. Fallback: new Date() (receipt time)
 */
export function resolveAttemptStartTime(
  payload: WebhookCallPayload,
  currentStartedAt?: Date | null,
  isNewAttempt = false,
): Date {
  // If it's a progress event for the SAME currently running attempt, anchor to original startedAt
  if (!isNewAttempt && currentStartedAt) {
    return currentStartedAt;
  }

  const fromInitiated = parseBolnaTimestamp(payload.initiated_at);
  if (fromInitiated) return fromInitiated;

  const fromTelephony = parseBolnaTimestamp(payload.telephony_data?.start_time);
  if (fromTelephony) return fromTelephony;

  const fromCreatedAt = parseBolnaTimestamp(payload.created_at);
  if (fromCreatedAt) return fromCreatedAt;

  const fromAt = parseBolnaTimestamp(payload.at);
  if (fromAt) return fromAt;

  return new Date();
}

/**
 * Resolves the actual completion time for a call or retry attempt.
 * Priority:
 * 1. payload.updated_at
 * 2. payload.telephony_data?.end_time
 * 3. payload.created_at
 * 4. payload.at
 * 5. Fallback: new Date() (receipt time)
 */
export function resolveAttemptEndTime(payload?: WebhookCallPayload): Date {
  if (!payload) return new Date();

  const fromUpdatedAt = parseBolnaTimestamp(payload.updated_at);
  if (fromUpdatedAt) return fromUpdatedAt;

  const fromTelephony = parseBolnaTimestamp(payload.telephony_data?.end_time);
  if (fromTelephony) return fromTelephony;

  const fromCreatedAt = parseBolnaTimestamp(payload.created_at);
  if (fromCreatedAt) return fromCreatedAt;

  const fromAt = parseBolnaTimestamp(payload.at);
  if (fromAt) return fromAt;

  return new Date();
}

