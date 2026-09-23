import type { RetryConfig } from "../../../../shared/types/bolna.types";
import { type LeadBatchEntityData } from "../../domain/entities/lead-batch.entity";

export interface CreateBatchData {
  campaignId: string;
  tenantId: string;
  fileName: string;
  totalLeads: number;
  retryConfig?: RetryConfig;
  termsAccepted: boolean;
  termsAcceptedAt: Date;
  termsVersion: string;
}

export interface CreateBatchInput {
  tenantId: string;
  campaignId: string;
  fileBuffer: Buffer;
  fileName: string;
  retryConfig?: RetryConfig;
  scheduledAt?: string;
  runImmediately?: boolean;
  termsAccepted: boolean;
  termsVersion: string;
}

export interface CreateBatchOutput {
  batch: Record<string, unknown>;
  stats: {
    totalRows: number;
    validIndian: number;
    filteredNonIndian: number;
    imported: number;
  };
  message?: string;
}

export interface CreateLeadData {
  name: string | null;
  phone: string;
  email?: string;
  company?: string;
  tenantId: string;
  campaignId: string;
  batchId: string;
  metadata: Record<string, unknown>;
}

export interface BatchStatsResult {
  batch: LeadBatchEntityData;
  leads: Array<{ status: string; _count: number }>;
  calls: Array<{ status: string; _count: number }>;
  totalCost: number;
}

export interface ScheduleBatchInput {
  tenantId: string;
  campaignId: string;
  batchId: string;
  scheduledAt: string;
}

export interface ResumeBatchOutput {
  originalBatchId: string;
  newBatch: Record<string, unknown>;
  remainingLeads: number;
  message: string;
}
