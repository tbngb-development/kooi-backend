import type { BatchStatus, LeadStopReason } from "@prisma/client";
import type { LeadBatchEntityData } from "../../domain/entities/lead-batch.entity";
import type {
  BatchStatsResult,
  CreateBatchData,
  CreateLeadData,
} from "../dto/batch.dto";

export interface BatchListItem extends LeadBatchEntityData {
  _count: { leads: number; calls: number };
}

export interface PendingLeadRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  metadata: Record<string, unknown> | null;
}

export interface BatchRepository {
  list(
    tenantId: string,
    campaignId: string,
    isDeleted?: boolean,
  ): Promise<BatchListItem[]>;

  findById(
    tenantId: string,
    campaignId: string,
    batchId: string,
    options?: { isDeleted?: boolean }, // Unified pattern
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

  decrementTotalLeads(batchId: string, count: number): Promise<void>;

  reassignCampaignLeadsToBatch(
    campaignId: string,
    batchId: string,
    phones: string[],
  ): Promise<number>;

  reassignLeadsToBatch(oldBatchId: string, newBatchId: string): Promise<number>;

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

  updateProgress(
    batchId: string,
    stage: string,
    progress: number,
  ): Promise<void>;

  updateProcessingError(batchId: string, error: string): Promise<void>;

  updateRawFileUrl(batchId: string, url: string): Promise<void>;

  updateTotalLeads(batchId: string, count: number): Promise<void>;

  softDelete(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<void>;
  restore(tenantId: string, campaignId: string, batchId: string): Promise<void>;
}
