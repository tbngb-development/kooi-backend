import type { BatchStatus, LeadStopReason } from "@prisma/client";
import type { LeadBatchEntityData } from "../../domain/entities/lead-batch.entity";
import type { BatchStatsResult, CreateBatchData, CreateLeadData } from "../dto/batch.dto";



// ── List Item ────────────────────────────────────────────────────────────────

export interface BatchListItem extends LeadBatchEntityData {
  _count: { leads: number; calls: number };
}

// ── Pending Lead (for resume) ────────────────────────────────────────────────

export interface PendingLeadRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  metadata: Record<string, unknown> | null;
}

// ── Repository Interface ─────────────────────────────────────────────────────

export interface BatchRepository {
  list(tenantId: string, campaignId: string): Promise<BatchListItem[]>;

  findById(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<LeadBatchEntityData | null>;

  findByIdWithCounts(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<BatchListItem | null>;

  create(data: CreateBatchData): Promise<LeadBatchEntityData>;

  update(
    batchId: string,
    data: {
      status?: BatchStatus;
      bolnaBatchId?: string;
      originalFileUrl?: string;
      transformedCsvUrl?: string;
      scheduledAt?: Date | null;
      bolnaScheduledAt?: Date | null;
    },
  ): Promise<LeadBatchEntityData>;

  delete(batchId: string): Promise<void>;

  createLeads(leads: CreateLeadData[]): Promise<number>;

  getStats(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<BatchStatsResult>;

  findPendingLeads(batchId: string): Promise<PendingLeadRow[]>;

  reassignLeadsToBatch(oldBatchId: string, newBatchId: string): Promise<number>;

  decrementTotalLeads(batchId: string, count: number): Promise<void>;

  resetActiveLeadsToPending(batchId: string): Promise<number>;

  markPendingLeadsAsStopped(
    batchId: string,
    reason: LeadStopReason,
  ): Promise<number>;

  getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]>;

  recalculateCampaignStats(campaignId: string): Promise<void>;

  findExistingPhones(
    campaignId: string,
    phones: string[],
  ): Promise<Set<string>>;
}
