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
  extracted_data?: Record<string, any> | null;
  telephony_data?: {
    duration: number | string;
    recording_url: string;
    to_number: string;
    from_number: string;
    hangup_reason?: string | null;
  };
  context_details?: {
    recipient_phone_number?: string;
  };
  recording_url?: string;
  duration?: number;
  messages?: WebhookMessage[];
  batch_run_details?: {
    retried: number;
  };
}

export interface WebhookBatchPayload {
  batch_id: string;
  state?: string;
  status?: string;
}