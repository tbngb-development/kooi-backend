export interface SarvamAgentVariable {
  key: string;
  defaultValue: string;
  isTenantVisible: boolean;
  isTenantEditable: boolean;
  required: boolean;
}

export interface WelcomeMessageConfig {
  defaultMessage: string;
  customTemplate?: string | null;
  interpolationVariables?: string[];
}

export type SarvamOutputVariableType = "string" | "enum";

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

export interface SarvamRetryCondition {
  enabled: boolean;
  threshold_seconds?: number | null;
}

export interface SarvamRetryConfig {
  max_retries: number;
  retry_on?: Record<string, SarvamRetryCondition> | null;
  retry_interval_minutes?: number | number[] | null;
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
}

export interface ResolvedTenantSarvamAgent {
  id: string;
  name: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond?: number | null;
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

