import type { CampaignStatus } from "@prisma/client";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";

// ── Input DTOs ───────────────────────────────────────────────────────────────

export interface CreateCampaignData {
  name: string;
  description?: string;
  assistantId: string;
  brochureId?: string;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown>;
}

// ── Aggregated Stats ─────────────────────────────────────────────────────────

export interface CampaignStatsResult {
  campaign: CampaignEntityData & {
    assistant: { id: string; name: string; bolnaId: string } | null;
    brochure: {
      id: string;
      projectName: string | null;
      configurations: string[];
      startingPrice: number | null;
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

export interface CampaignPerformanceResult {
  hotLeads: number;
  callbacks: number;
  siteVisits: number;
  dnc: number;
  totalCost: number;
  costPerLead: number;
  qualificationRate: string;
  bestPickupTime: string;
  bestConversionTime: string;
  topBudget: string;
  topConfiguration: string;
}

// ── List Item Shape ──────────────────────────────────────────────────────────

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
  assistant: { id: string; name: string; bolnaId: string } | null;
  brochure: {
    id: string;
    projectName: string | null;
    city: string | null;
    configurations: string[];
  } | null;
  batches: Array<{
    id: string;
    status: string;
    totalLeads: number;
    completedLeads: number;
  }>;
}

// ── Repository Interface ─────────────────────────────────────────────────────

export interface CampaignRepository {
  list(tenantId: string): Promise<CampaignListItem[]>;

  findById(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignEntityData | null>;

  findByIdWithRelations(
    tenantId: string,
    campaignId: string,
  ): Promise<
    | (CampaignEntityData & {
        assistant: { id: string; name: string; bolnaId: string } | null;
        brochure: { id: string; isConfirmed: boolean } | null;
        batches: Array<{ id: string; status: string }>;
      })
    | null
  >;

  create(
    tenantId: string,
    data: CreateCampaignData,
  ): Promise<CampaignEntityData>;

  updateStatus(
    campaignId: string,
    status: CampaignStatus,
    extra?: { startedAt?: Date; completedAt?: Date },
  ): Promise<void>;

  incrementTotalLeads(campaignId: string, count: number): Promise<void>;

  getStats(tenantId: string, campaignId: string): Promise<CampaignStatsResult>;

  getPerformance(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignPerformanceResult>;

  checkAssistantExists(tenantId: string, assistantId: string): Promise<boolean>;

  checkBrochureConfirmed(
    tenantId: string,
    brochureId: string,
  ): Promise<boolean>;
}
