// modules/campaigns/application/interfaces/campaign-repository.interface.ts

import type { CampaignStatus, VoiceProvider } from "@prisma/client";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  CampaignDetailOverview,
  ExtractionInsightResult,
  ExtractionOverviewResult,
  CampaignCallMetricsResult,
  CampaignGoalMetricsResult,
  ListCampaignsFilters,
  PaginatedCampaignsResult,
} from "../dto/campaign.dto";

export interface CreateCampaignData {
  id?: string;
  name: string;
  description?: string;
  assistantId?: string;
  sarvamAgentId?: string;
  startTimestamp?: string | Date;
  endTimestamp?: string | Date;
  allowedSchedule?: Record<string, unknown>;
  status?: CampaignStatus;
  provider?: VoiceProvider;
  sarvamCampaignId?: string | null;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown>;
  goals?: Array<{
    agentGoalId?: string;
    outputVariableName: string;
    expectedValue: string;
    displayName: string;
  }>;
}

export interface UpdateCampaignData {
  name?: string;
  description?: string | null;
  assistantId?: string | null;
  sarvamAgentId?: string | null;
  sarvamCampaignId?: string | null;
  startTimestamp?: string | Date | null;
  endTimestamp?: string | Date | null;
  allowedSchedule?: Record<string, unknown> | null;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown> | null;
}

export interface CampaignStatsResult {
  campaign: CampaignEntityData & {
    assistant: {
      id: string;
      name: string;
      platformAgent: { bolnaId: string };
    } | null;
    batches: Array<{
      id: string;
      status: string;
      fileName: string | null;
      totalLeads: number;
      calledLeads: number;
      completedLeads: number;
      failedLeads: number;
      createdAt: Date;
    }>;
  };
  leads: Array<{ status: string; _count: number }>;
  calls: Array<{ status: string; _count: number }>;
}

export interface CampaignListItem {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  provider: VoiceProvider;
  sarvamCampaignId?: string | null;
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  failedLeads: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  assistant: { id: string; name: string } | null;
  sarvamAgent?: { id: string; name: string } | null;
  agent?: { id: string; name: string } | null;
  batches: Array<{
    id: string;
    status: string;
    totalLeads: number;
    completedLeads: number;
  }>;
}

export interface ActiveSarvamCampaignRecord {
  id: string;
  tenantId: string;
  sarvamCampaignId: string;
  sarvamAgentId: string;
  status: CampaignStatus;
  sarvamStatus: string | null;
  endTimestamp?: Date | null;
}

export interface AssistantWithAgentData {
  id: string;
  name: string;
  platformAgent: {
    id: string;
    bolnaId: string;
    requiredVariables: RequiredVariable[] | null;
  };
}

export interface SarvamAgentWithApiKeyData {
  id: string;
  name: string;
  appId: string;
  appVersion: number;
  attemptsPerSecond: number | null;
  welcomeMessage?: unknown;
  agentVariables: unknown;
  connectionConfigs: unknown;
  retryConfig: unknown;
  allowedSchedule?: unknown;
  allowTenantVisible: boolean;
  status: string;
  apiKey: {
    id: string;
    tenantId: string;
    apiKeyEncrypted: string;
    workspaceId: string;
    organizationId: string;
    isActive: boolean;
  };
  overrides?: Array<{ variableOverrides: unknown }> | null;
  goals?: Array<{
    id: string;
    outputVariableName: string;
    expectedValue: string;
    displayName: string;
  }>;
}

export interface CampaignCascadeResult {
  archivedCalls?: number;
  archivedLeads?: number;
  archivedBatches?: number;
  restoredCalls?: number;
  restoredLeads?: number;
  restoredBatches?: number;
}

export interface CampaignRepository {
  list(
    tenantId: string,
    filters: ListCampaignsFilters,
  ): Promise<PaginatedCampaignsResult>;

  findById(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignEntityData | null>;

  findByIdGlobal(campaignId: string): Promise<CampaignEntityData | null>;

  findByIdWithRelations(
    tenantId: string,
    campaignId: string,
  ): Promise<
    | (CampaignEntityData & {
        assistant: {
          id: string;
          name: string;
          platformAgent: { bolnaId: string };
        } | null;
        sarvamAgent?: {
          id: string;
          name: string;
          appId: string;
          agentVariables?: unknown;
        } | null;
        batches: Array<{ id: string; status: string }>;
      })
    | null
  >;

  getCampaignOverviewStats(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignDetailOverview>;

  create(
    tenantId: string,
    data: CreateCampaignData,
  ): Promise<CampaignEntityData>;

  update(
    tenantId: string,
    campaignId: string,
    data: UpdateCampaignData,
  ): Promise<CampaignEntityData>;

  updateStatus(
    campaignId: string,
    status: CampaignStatus,
    extra?: { startedAt?: Date; completedAt?: Date },
  ): Promise<CampaignEntityData>;

  findActiveSarvamCampaigns(): Promise<ActiveSarvamCampaignRecord[]>;

  countActiveCampaignsForAgent(
    sarvamAgentId: string,
    excludeCampaignId?: string,
  ): Promise<number>;

  updateSarvamStatus(
    campaignId: string,
    sarvamStatus: string,
    kooiStatus?: CampaignStatus,
    extra?: { completedAt?: Date },
  ): Promise<CampaignEntityData>;

  getStats(tenantId: string, campaignId: string): Promise<CampaignStatsResult>;

  getExtractionOverview(
    tenantId: string,
    campaignId: string,
    batchId?: string,
  ): Promise<ExtractionOverviewResult>;

  getExtractionInsights(
    tenantId: string,
    campaignId: string,
    batchId?: string,
    topN?: number,
  ): Promise<ExtractionInsightResult>;

  getCampaignCallMetrics(
    tenantId: string,
    campaignId: string,
    batchId?: string,
  ): Promise<CampaignCallMetricsResult>;

  getCampaignGoalMetrics(
    tenantId: string,
    campaignId: string,
    batchId?: string,
  ): Promise<CampaignGoalMetricsResult>;

  findAssistantWithAgent(
    tenantId: string,
    assistantId: string,
  ): Promise<AssistantWithAgentData | null>;

  findSarvamAgentWithApiKey(
    tenantId: string,
    sarvamAgentId: string,
  ): Promise<SarvamAgentWithApiKeyData | null>;

  resolveAssistantForPlatformAgent(
    tenantId: string,
    platformAgentId: string,
  ): Promise<AssistantWithAgentData | null>;

  softDelete(
    tenantId: string,
    campaignId: string,
  ): Promise<{
    archivedCalls: number;
    archivedLeads: number;
    archivedBatches: number;
  }>;

  restore(
    tenantId: string,
    campaignId: string,
  ): Promise<{
    restoredCalls: number;
    restoredLeads: number;
    restoredBatches: number;
  }>;
}
