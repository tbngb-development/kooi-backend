export interface SarvamAgentVariable {
  key: string;
  defaultValue: string;
  isTenantVisible: boolean;
  isTenantEditable: boolean;
}

export interface WelcomeMessageConfig {
  defaultMessage: string;
}

export interface SarvamOutputVariable {
  name: string;
  description: string;
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
}

export interface ResolvedTenantSarvamAgent {
  id: string;
  name: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond?: number | null;
  webhookUrl?: string | null;
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

