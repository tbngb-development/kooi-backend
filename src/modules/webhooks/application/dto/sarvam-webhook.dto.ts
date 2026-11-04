export interface SarvamTranscriptTurn {
  role: "agent" | "user" | string;
  en_text?: string;
  text?: string;
}

export interface SarvamWebhookAttemptPayload {
  app_id: string;
  app_version: number;
  attempt_id: string;
  campaign_id: string;
  cohort_id: string;
  completion_status: "completed" | "partial" | "failed" | string;
  connectivity_status?: "connected" | "busy" | "no_answer" | "failed" | null | string;
  next_action_status?:
    | "retry"
    | "reschedule"
    | "business_retry"
    | "short_duration_retry"
    | "provider_error_retry"
    | "internal_error_retry"
    | null
    | string;
  failure_reason?: string | null;
  user_identifier: string;
  user_phone_number: string;
  agent_phone_number?: string | null;
  duration?: number | null;
  interaction_id?: string | null;
  retry_attempt: number;
  executed_at?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  initial_agent_variables?: Record<string, unknown> | null;
  final_agent_variables?: Record<string, unknown> | null;
  output_agent_variables?: Record<string, unknown> | null;
  interaction_transcript?: SarvamTranscriptTurn[] | null;
  metadata?: Record<string, unknown> | null;
}

export function isValidSarvamWebhookPayload(
  payload: unknown,
): payload is SarvamWebhookAttemptPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  return (
    typeof p.attempt_id === "string" &&
    p.attempt_id.trim().length > 0 &&
    typeof p.campaign_id === "string" &&
    p.campaign_id.trim().length > 0 &&
    typeof p.cohort_id === "string" &&
    p.cohort_id.trim().length > 0 &&
    typeof p.user_phone_number === "string" &&
    p.user_phone_number.trim().length > 0
  );
}

