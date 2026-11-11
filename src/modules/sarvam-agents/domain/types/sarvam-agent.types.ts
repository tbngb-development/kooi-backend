export type AgentGender = "MALE" | "FEMALE";
export type PlatformAgentType = "OUTBOUND" | "INBOUND" | "BOTH";

export interface SarvamAudioRecording {
  language: string;
  audioUrl: string;
}

export type SarvamVariableDataType = "string";
export type SarvamVariableInputType = "text" | "textarea";

export interface SarvamAgentVariable {
  key: string;
  defaultValue: string;
  isTenantVisible: boolean;
  isTenantEditable: boolean;
  required: boolean;
  dataType?: SarvamVariableDataType;
  inputType?: SarvamVariableInputType;
  description?: string | null;
}

export interface WelcomeMessageConfig {
  defaultMessage: string;
  customTemplate?: string | null;
  interpolationVariables?: string[];
}

export type SarvamOutputVariableType = "string" | "enum";
export interface SarvamAgentGoal {
  id?: string;
  agentId?: string;
  outputVariableName: string;
  expectedValue: string;
  displayName: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface SarvamOutputVariable {
  name: string;
  description: string;
  type: SarvamOutputVariableType;
  options?: string[];
}

export interface SarvamConnectionConfig {
  connection_id: string;
  agent_phone_number?: string;
  phone_numbers?: string[];
}

export interface SarvamWebhookConfig {
  url: string;
  metadata?: Record<string, unknown> | null;
}

export interface SarvamBaseRetryCondition {
  enabled: boolean;
}

export interface SarvamShortDurationRetryCondition {
  enabled: boolean;
  threshold_seconds: number;
}

export interface SarvamErrorRetryCondition {
  enabled: boolean;
  max_retries: number;
  retry_interval_minutes: number;
}

export interface SarvamRetryOnConfig {
  busy?: SarvamBaseRetryCondition | null;
  failed?: SarvamBaseRetryCondition | null;
  no_answer?: SarvamBaseRetryCondition | null;
  short_duration?: SarvamShortDurationRetryCondition | null;
  provider_error?: SarvamErrorRetryCondition | null;
  internal_error?: SarvamErrorRetryCondition | null;
}

export interface SarvamRetryCondition {
  enabled: boolean;
  threshold_seconds?: number | null;
  max_retries?: number | null;
  retry_interval_minutes?: number | null;
}

export interface SarvamRetryConfig {
  max_retries: number;
  retry_on?: SarvamRetryOnConfig | Record<string, SarvamRetryCondition> | null;
  retry_interval_minutes?: number | number[] | null;
}

export interface SarvamCampaignRetryOverride {
  enabled: boolean;
  max_retries?: number;
  retry_on?: SarvamRetryOnConfig | Record<string, SarvamRetryCondition> | null;
  retry_interval_minutes?: number | number[] | null;
}

export interface SarvamAllowedSchedule {
  allowed_start_time: string;
  allowed_end_time: string;
  allowed_days: string[];
  timezone?: string;
}

export interface TenantWelcomeMessageOverride {
  customMessage?: string | null;
}

export interface TenantVariableOverrides {
  [key: string]: string;
}

export interface EffectiveSarvamVariable {
  key: string;
  defaultValue: string;
  effectiveValue: string;
  isTenantEditable: boolean;
  isOverridden: boolean;
  required: boolean;
  dataType: SarvamVariableDataType;
  inputType: SarvamVariableInputType;
  description?: string | null;
}

export interface ResolvedTenantSarvamAgent {
  id: string;
  name: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond?: number | null;
  gender?: AgentGender | null;
  type?: PlatformAgentType;
  audioUrl?: string | null;
  audioRecordings: SarvamAudioRecording[];
  status: "ACTIVE" | "ARCHIVED";
  welcomeMessage: {
    defaultMessage: string;
    customMessage: string | null;
    effectiveMessage: string;
    isOverridden: boolean;
  };
  variables: EffectiveSarvamVariable[];
  createdAt: Date;
  updatedAt: Date;
}
