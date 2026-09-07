import {
  type CallStatus,
  type LeadStatus,
  type BatchStatus,
  type CampaignStatus,
} from "@prisma/client";
import type {
  CallHistoryItem,
  ParsedCallAnalysis,
} from "../../../../shared/types/bolna.types";

export interface ResolvedCallContext {
  id: string;
  bolnaCallId: string | null;
  tenantId: string;
  campaignId: string;
  leadId: string;
  batchId: string | null;
  status: CallStatus;
  duration: number | null;
  cost: number | null;
  recording: string | null;
  transcript: string | null;
  summary: string | null;
  callHistory: CallHistoryItem[];
  updatedAt: Date;
}

export interface WebhookRepository {
  // Call Resolution
  findCallByBolnaCallId(
    bolnaCallId: string,
  ): Promise<ResolvedCallContext | null>;
  findCallByLeadAndBatch(
    leadId: string,
    batchId: string,
  ): Promise<ResolvedCallContext | null>;
  findBatchIdByBolnaBatchId(bolnaBatchId: string): Promise<{
    id: string;
    tenantId: string;
    campaignId: string;
    status: BatchStatus;
  } | null>;
  findLeadByPhoneAndBatch(
    phone: string,
    batchId: string,
  ): Promise<{ id: string } | null>;
  findLeadByPhoneAndCampaign(
    phone: string,
    campaignId: string,
  ): Promise<{ id: string } | null>;

  // Call Mutations
  createCall(data: {
    bolnaCallId: string;
    tenantId: string;
    campaignId: string;
    leadId: string;
    batchId: string | null;
    status: CallStatus;
    startedAt: Date;
  }): Promise<ResolvedCallContext>;

  updateCallStatusAndHistory(
    callId: string,
    bolnaCallId: string,
    status: CallStatus,
    history: CallHistoryItem[],
  ): Promise<ResolvedCallContext>;

  updateCallTerminalState(
    callId: string,
    data: {
      status: CallStatus;
      summary?: string | null;
      transcript?: string | null;
      transcriptMessages?: unknown | null;
      duration?: number | null;
      recording?: string | null;
      cost?: number | null;
      endedAt: Date;
    },
  ): Promise<void>;

  // Lead Mutations
  updateLeadStatus(
    leadId: string,
    status: LeadStatus,
    doNotCall?: boolean,
  ): Promise<void>;

  // Analysis Mutations
  upsertCallAnalysis(
    callId: string,
    tenantId: string,
    analysis: ParsedCallAnalysis,
  ): Promise<void>;

  // Lifecycle & Stats
  incrementTerminalStats(
    campaignId: string,
    batchId: string | null,
    status: CallStatus,
  ): Promise<void>;

  countActiveLeadsInBatch(batchId: string): Promise<number>;
  countActiveLeadsInCampaignLegacy(campaignId: string): Promise<number>;
  getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]>;

  updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    completedAt?: Date,
  ): Promise<void>;
  updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    completedAt?: Date,
  ): Promise<void>;

  /** Persist the calculated cost breakdown after a successful wallet debit. */
  updateCallCostBreakdown(
    callId: string,
    data: { platformCost: number; billableSeconds: number },
  ): Promise<void>;
}
