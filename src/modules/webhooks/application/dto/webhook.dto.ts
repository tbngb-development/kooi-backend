export interface WebhookMessage {
  role: "agent" | "user";
  content: string;
  created_at?: string;
}

export interface WebhookCallPayload {
  id?: string;
  execution_id?: string;
  run_id?: string;
  agent_id?: string;
  batch_id?: string;
  status: string;
  transcript?: string | null;
  summary?: string | null;
  conversation_duration?: number;
  total_cost?: number;
  error_message?: string | null;
  user_number?: string;
  agent_number?: string;
  extracted_data?: Record<string, any> | null;
  telephony_data?: {
    duration: number | string;
    recording_url: string;
    to_number: string;
    from_number: string;
    call_type?: string;
    hangup_reason?: string | null;
  };
  context_details?: {
    recipient_phone_number?: string;
  };
  recording_url?: string;
  duration?: number;
  created_at?: string;
  at?: string;
  scheduled_at?: string;
  messages?: WebhookMessage[];
  retry_count?: number;
  retry_history?: Array<{
    attempt?: number;
    status?: string;
    duration?: number;
    hangup_reason?: string;
    error_message?: string;
    created_at?: string;
    at?: string;
  }>;
  batch_run_details?: {
    retried: number;
  };
}

export interface WebhookBatchPayload {
  batch_id: string;
  state?: string;
  status?: string;
}