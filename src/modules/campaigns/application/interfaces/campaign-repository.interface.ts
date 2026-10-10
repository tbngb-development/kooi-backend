// modules/campaigns/application/interfaces/campaign-repository.interface.ts

import type { CampaignStatus } from "@prisma/client";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  CampaignDetailOverview,
  ExtractionInsightResult,
  ExtractionOverviewResult,
  ListCampaignsFilters,
  PaginatedCampaignsResult,
} from "../dto/campaign.dto";

export interface CreateCampaignData {
  name: string;
  description?: string;
  assistantId: string;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown>;
}

export interface UpdateCampaignData {
  name?: string;
  description?: string | null;
  assistantId?: string;
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
  totalLeads: number;
  calledLeads: number;
  completedLeads: number;
  failedLeads: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  assistant: { id: string; name: string } | null;
  batches: Array<{
    id: string;
    status: string;
    totalLeads: number;
    completedLeads: number;
  }>;
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

  incrementTotalLeads(campaignId: string, count: number): Promise<void>;

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

  findAssistantWithAgent(
    tenantId: string,
    assistantId: string,
  ): Promise<AssistantWithAgentData | null>;

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
