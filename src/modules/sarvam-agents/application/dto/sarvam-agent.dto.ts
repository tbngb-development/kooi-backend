import type {
  SarvamAgentVariable,
  WelcomeMessageConfig,
  SarvamOutputVariable,
  EffectiveSarvamVariable,
  SarvamConnectionConfig,
  SarvamRetryConfig,
  SarvamAgentGoal,
  SarvamAllowedSchedule,
} from "../../domain/types/sarvam-agent.types";

export interface CreateSarvamAgentDTO {
  name: string;
  apiKeyId: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond?: number | null;
  agentVariables?: SarvamAgentVariable[];
  welcomeMessage?: WelcomeMessageConfig;
  outputVariables?: SarvamOutputVariable[];
  connectionConfigs: SarvamConnectionConfig[];
  retryConfig?: SarvamRetryConfig;
  allowedSchedule?: SarvamAllowedSchedule;
  allowTenantVisible?: boolean;
  goals?: SarvamAgentGoal[];
  createdBy: string;
}

export interface UpdateSarvamAgentDTO {
  id: string;
  name?: string;
  appId?: string;
  appVersion?: number;
  attemptsPerSecond?: number | null;
  agentVariables?: SarvamAgentVariable[];
  welcomeMessage?: WelcomeMessageConfig;
  outputVariables?: SarvamOutputVariable[];
  connectionConfigs?: SarvamConnectionConfig[];
  retryConfig?: SarvamRetryConfig;
  allowedSchedule?: SarvamAllowedSchedule;
  allowTenantVisible?: boolean;
  status?: "ACTIVE" | "ARCHIVED";
  goals?: SarvamAgentGoal[];
  updatedBy?: string;
}

export interface ListSarvamAgentsQueryDTO {
  page?: number;
  limit?: number;
  search?: string;
  apiKeyId?: string;
  status?: "ACTIVE" | "ARCHIVED";
  tenantId?: string;
}

export interface SarvamAgentAdminResponseDTO {
  id: string;
  name: string;
  apiKeyId: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond: number | null;
  agentVariables: SarvamAgentVariable[];
  welcomeMessage: WelcomeMessageConfig;
  outputVariables: SarvamOutputVariable[];
  connectionConfigs: SarvamConnectionConfig[];
  retryConfig: SarvamRetryConfig;
  allowedSchedule?: SarvamAllowedSchedule;
  allowTenantVisible: boolean;
  status: "ACTIVE" | "ARCHIVED";
  goals: SarvamAgentGoal[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  apiKey?: {
    id: string;
    workspaceId: string;
    organizationId: string;
    isActive: boolean;
    tenant: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export interface SarvamAgentListResponseDTO {
  items: SarvamAgentAdminResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant-Facing DTOs (Restricted, Sanitized & Resolved)
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantSarvamAgentSummaryDTO {
  id: string;
  name: string;
  appId: string;
  appVersion: number;
  status: "ACTIVE";
  allowTenantVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSarvamAgentDetailDTO {
  id: string;
  name: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond: number | null;
  status: "ACTIVE";
  welcomeMessage: {
    defaultMessage: string;
    customMessage: string | null;
    effectiveMessage: string;
    isOverridden: boolean;
  };
  variables: EffectiveSarvamVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTenantVariablesDTO {
  variables: Record<string, string | null>;
}

export interface UpdateTenantWelcomeMessageDTO {
  customMessage: string | null;
}
