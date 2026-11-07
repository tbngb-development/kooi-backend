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

