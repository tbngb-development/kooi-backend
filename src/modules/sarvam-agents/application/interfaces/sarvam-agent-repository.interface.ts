import type {
  SarvamAgent,
  SarvamApiKey,
  Tenant,
  Prisma,
} from "@prisma/client";
import type {
  SarvamAgentVariable,
  WelcomeMessageConfig,
  SarvamOutputVariable,
  SarvamConnectionConfig,
  SarvamRetryConfig,
  SarvamAgentGoal,
  SarvamAllowedSchedule,
} from "../../domain/types/sarvam-agent.types";

export type SarvamAgentWithApiKeyAndTenant = SarvamAgent & {
  apiKey: SarvamApiKey & {
    tenant: Pick<Tenant, "id" | "name" | "email" | "isActive">;
  };
  goals?: SarvamAgentGoal[];
};

export interface CreateSarvamAgentRecord {
  name: string;
  apiKeyId: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond?: number | null;
  agentVariables: SarvamAgentVariable[];
  welcomeMessage: WelcomeMessageConfig;
  outputVariables: SarvamOutputVariable[];
  connectionConfigs: SarvamConnectionConfig[];
  retryConfig: SarvamRetryConfig;
  allowedSchedule?: SarvamAllowedSchedule;
  allowTenantVisible?: boolean;
  status?: "ACTIVE" | "ARCHIVED";
  goals?: SarvamAgentGoal[];
  createdBy: string;
}

export interface UpdateSarvamAgentRecord {
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
}

export interface ListSarvamAgentsFilter {
  page?: number;
  limit?: number;
  search?: string;
  apiKeyId?: string;
  status?: "ACTIVE" | "ARCHIVED";
  tenantId?: string;
}

export interface ISarvamAgentRepository {
  create(data: CreateSarvamAgentRecord): Promise<SarvamAgentWithApiKeyAndTenant>;
  update(
    id: string,
    data: UpdateSarvamAgentRecord,
  ): Promise<SarvamAgentWithApiKeyAndTenant>;
  findById(id: string): Promise<SarvamAgentWithApiKeyAndTenant | null>;
  findByApiKeyAndAppId(
    apiKeyId: string,
    appId: string,
  ): Promise<SarvamAgent | null>;
  list(filter: ListSarvamAgentsFilter): Promise<{
    items: SarvamAgentWithApiKeyAndTenant[];
    total: number;
  }>;
  archive(id: string): Promise<SarvamAgentWithApiKeyAndTenant>;
  archiveByApiKeyId(apiKeyId: string): Promise<number>;
  listAccessibleForTenant(tenantId: string): Promise<SarvamAgent[]>;
  findAccessibleForTenant(
    id: string,
    tenantId: string,
  ): Promise<SarvamAgent | null>;
  existsForApiKeyAndAppId(
    apiKeyId: string,
    appId: string,
    excludeId?: string,
  ): Promise<boolean>;
}
