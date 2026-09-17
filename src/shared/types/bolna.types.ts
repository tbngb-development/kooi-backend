import {
  type ContactChannel,
  type Disposition,
  type ExtractionFlag,
  type LeadTemperature,
  type LocationMatch,
  type PreferredNextAction,
  type PurchasePurpose,
  type PurchaseTimeline,
} from "@prisma/client";

export interface BolnaCallPayload {
  agent_id: string;
  recipient_phone_number: string;
  user_data?: Record<string, string>;
  scheduled_at?: string;
  from_phone_number?: string;
}

export interface BolnaCallResponse {
  id: string;
  status: string;
  message: string;
  execution_id: string;
  agent_id: string;
  transcript?: string | null;
  summary?: string | null;
  conversation_duration?: number;
  total_cost?: number;
  error_message?: string | null;

  telephony_data?: {
    duration: number;
    recording_url: string;
    to_number: string;
    from_number: string;
    hangup_reason?: string | null;
    hangup_by?: string | null;
  };

  context_details?: {
    recipient_data: Record<string, string>;
    recipient_phone_number: string;
  };

  usage_breakdown?: {
    llmTokens: number;
    synthesizer_model: string;
    transcriber_model: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// V1 AUTO-RETRY SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryConfig {
  enabled: boolean;
  max_retries: number; // Maximum retry attempts (1-3)
  retry_on_statuses?: Array<"no-answer" | "busy" | "failed">;
  retry_on_voicemail?: boolean;
  retry_intervals_minutes?: number[];
}

export interface BolnaBatchResponse {
  batch_id: string;
  state: "created";
}

export interface BolnaBatchScheduleResponse {
  message: string;
  state: string; // Returns: "scheduled at <timestamp>"
}

export interface BolnaBatchStatus {
  batch_id: string;
  humanized_created_at: string;
  created_at: string;
  updated_at: string;
  status:
    "created" | "scheduled" | "running" | "completed" | "stopped" | "failed";
  scheduled_at?: string;
  from_phone_numbers?: string[];
  file_name?: string;
  valid_contacts?: number;
  total_contacts?: number;
  execution_status?: Record<string, number>;
}

export interface BolnaExecution {
  id: string;
  agent_id: string;
  batch_id?: string;
  conversation_duration: number;
  total_cost: number;
  status: string;
  error_message?: string | null;
  answered_by_voice_mail?: boolean;
  transcript?: string;
  created_at: string;
  updated_at: string;
  telephony_data?: {
    duration: string;
    to_number: string;
    from_number: string;
    recording_url?: string;
    provider_call_id?: string;
  };
  extracted_data?: Record<string, any> | null;
  context_details?: {
    recipient_data?: Record<string, string>;
  };
  batch_run_details?: {
    status: string;
    created_at: string;
    updated_at: string;
    retried: number;
  };
}

export interface CallHistoryItem {
  attempt: number;
  bolnaCallId: string;
  status: string;
  duration?: number | null;
  cost?: number | null;
  timestamp: string;
  errorMessage?: string | null;
}

// Existing Assistant, Task and Prompt Configuration structures remain unmodified below...
export interface BolnaCreateAgentPayload {
  agent_name: string;
  agent_welcome_message: string;
  agent_type: string;
  tasks: BolnaTask[];
}

export interface BolnaLLMConfig {
  agent_flow_type: string;
  provider: string;
  family: string;
  model: string;
  summarization_details: unknown | null;
  extraction_details: unknown | null;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
  base_url: string;
  top_p: number;
  min_p: number;
  top_k: number;
  temperature: number;
  request_json: boolean;
}

export interface BolnaRoute {
  route_name: string;
  utterances: string[];
  response: string;
  score_threshold: number;
}

export interface BolnaRoutesConfig {
  embedding_model: string;
  routes: BolnaRoute[];
}

export interface BolnaLLMAgent {
  agent_type: string;
  agent_flow_type: string;
  routes: BolnaRoutesConfig | null;
  llm_config: BolnaLLMConfig;
}

export interface BolnaSynthesizerProviderConfig {
  voice: string;
  voice_id: string;
  model: string;
}

export interface BolnaSynthesizer {
  provider: string;
  provider_config: BolnaSynthesizerProviderConfig;
  stream: boolean;
  buffer_size: number;
  audio_format: string;
}

export interface BolnaTranscriber {
  provider: string;
  model: string;
  language: string;
  stream: boolean;
  sampling_rate: number;
  encoding: string;
  endpointing: number;
}

export interface BolnaIOConfig {
  provider: string;
  format: string;
}

export interface BolnaToolsConfig {
  llm_agent: BolnaLLMAgent;
  synthesizer: BolnaSynthesizer;
  transcriber: BolnaTranscriber;
  input: BolnaIOConfig;
  output: BolnaIOConfig;
  api_tools: unknown | null;
  multilingual_config: unknown | null;
}

export interface BolnaToolchain {
  pipelines: string[][];
}

export interface BolnaTaskConfig {
  hangup_after_silence: number;
  incremental_delay: number;
  number_of_words_for_interruption: number;
  hangup_after_LLMCall: boolean;
  call_cancellation_prompt: string | null;
  backchanneling: boolean;
  backchanneling_message_gap: number;
  backchanneling_start_delay: number;
  ambient_noise_track: string;
  call_terminate: number;
  voicemail: boolean;
  inbound_limit: number;
  whitelist_phone_numbers: string[] | null;
  disallow_unknown_numbers: boolean;
}

export interface BolnaTask {
  tools_config: BolnaToolsConfig;
  toolchain: BolnaToolchain;
  task_config: BolnaTaskConfig;
}

export interface BolnaIngestSourceConfig {
  source_type: string;
  source_url: string | null;
  source_auth_token: string | null;
  source_name: string | null;
}

export interface BolnaTaskPrompt {
  system_prompt: string;
  first_message?: string;
}

export interface BolnaAgentPrompts {
  [taskKey: string]: BolnaTaskPrompt;
  task_1: BolnaTaskPrompt;
}

export interface BolnaAgentResponse {
  id: string;
  agent_name: string;
  agent_status: string;
  agent_welcome_message: string;
  agent_type: string;
  created_at: string;
  updated_at: string;
  tasks: BolnaTask[];
  ingest_source_config: BolnaIngestSourceConfig | null;
  agent_prompts: BolnaAgentPrompts;
}

export enum BolnaDataSection {
  CALL_OUTCOME = "Call Outcome",
  LEAD_QUALIFICATION = "Lead Qualification",
  NEXT_ACTION_AND_CONTACT_PREFERENCE = "Next Action and Contact Preference",
  FOLLOW_UP_SCHEDULE = "Follow-Up Schedule",
  COMPLIANCE = "Compliance",
  SUMMARY = "Summary",
}

export interface BolnaExtractedField {
  subjective: string | null;
  objective: string | null;
  confidence: number;
  confidence_label: string;
  reasoning_subjective: string | null;
  reasoning_objective: string | null;
  validation: string | null;
}

export interface BolnaExtractedData {
  [BolnaDataSection.CALL_OUTCOME]?: {
    disposition?: BolnaExtractedField;
    lead_temperature?: BolnaExtractedField;
  };
  [BolnaDataSection.LEAD_QUALIFICATION]?: {
    preferred_configuration?: BolnaExtractedField;
    budget_range?: BolnaExtractedField;
    purchase_timeline?: BolnaExtractedField;
    purchase_purpose?: BolnaExtractedField;
    location_match?: BolnaExtractedField;
    customer_location_pref?: BolnaExtractedField;
  };
  [BolnaDataSection.NEXT_ACTION_AND_CONTACT_PREFERENCE]?: {
    preferred_next_action?: BolnaExtractedField;
    preferred_contact_channel?: BolnaExtractedField;
  };
  [BolnaDataSection.FOLLOW_UP_SCHEDULE]?: {
    followup_schedule?: BolnaExtractedField;
  };
  [BolnaDataSection.COMPLIANCE]?: {
    do_not_call?: BolnaExtractedField;
    language_support_required?: BolnaExtractedField;
  };
  [BolnaDataSection.SUMMARY]?: {
    call_summary?: BolnaExtractedField;
  };
}

export interface ParsedCallAnalysis {
  disposition: Disposition | null;
  leadTemperature: LeadTemperature | null;
  preferredConfiguration: string | null;
  budgetRange: string | null;
  purchaseTimeline: PurchaseTimeline | null;
  purchasePurpose: PurchasePurpose | null;
  locationMatch: LocationMatch | null;
  customerLocationPref: string | null;
  preferredNextAction: PreferredNextAction | null;
  preferredContactChannel: ContactChannel | null;
  followupSchedule: string | null;
  doNotCall: ExtractionFlag | null;
  languageSupportRequired: ExtractionFlag | null;
  callSummary: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION TYPES (Bolna Dispositions & Categories)
// ─────────────────────────────────────────────────────────────────────────────

export interface BolnaObjectiveOption {
  value: string;
  condition: string;
  sub_options?: BolnaObjectiveOption[];
}

export interface BolnaSubjectiveTypeConfig {
  pattern: string;
  description?: string;
}

export interface BolnaDispositionResponse {
  id: string;
  name: string;
  question: string;
  system_prompt: string | null;
  category: string;
  category_id: string | null;
  model: string;
  is_subjective: boolean;
  is_objective: boolean;
  subjective_type: string;
  subjective_type_config: BolnaSubjectiveTypeConfig | null;
  objective_options: BolnaObjectiveOption[] | null;
  agent_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BolnaExtractionCategoryResponse {
  id: string;
  name: string;
  model: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
  dispositions?: BolnaDispositionResponse[];
}

export interface BolnaExtractionCategoryListResponse {
  categories: BolnaExtractionCategoryResponse[];
}

export interface BolnaDispositionCreatePayload {
  agent_id: string;
  name: string;
  question: string;
  category_id?: string;
  category?: string;
  system_prompt?: string;
  model?: string;
  is_subjective?: boolean;
  is_objective?: boolean;
  subjective_type?: string;
  subjective_type_config?: BolnaSubjectiveTypeConfig | null;
  objective_options?: BolnaObjectiveOption[];
}

export interface BolnaDispositionCreateResponse {
  message: string;
  id: string;
  category_id: string;
}

export interface BolnaCategoryCreatePayload {
  name: string;
  model: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC EXTRACTION CONFIG (PlatformAgent.extractionConfig)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractionMetricConfig {
  label: string;
  category: string;
  disposition: string;
  matchValue: string;
}

export interface ExtractionResultConfig {
  label: string;
  category: string;
  disposition: string;
}

export interface ExtractionConfig {
  metrics: ExtractionMetricConfig[];
  results: ExtractionResultConfig[];
}

export interface RequiredVariable {
  name: string;
  label: string;
  required: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC EXTRACTION RESPONSE (CallAnalysis.extractionResponse)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractionMetricResponse {
  label: string;
  category: string;
  disposition: string;
  matchValue: string;
  matched: boolean;
  actualValue: string | null;
}

export interface ExtractionResultResponse {
  label: string;
  category: string;
  disposition: string;
  value: string | null;
}

export interface ExtractionResponse {
  metrics: ExtractionMetricResponse[];
  results: ExtractionResultResponse[];
}
