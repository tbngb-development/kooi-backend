import {
  type CallStatus,
  type LeadStatus,
  type BatchStatus,
  type CampaignStatus,
} from "@prisma/client";
import type {
  CallHistoryItem,
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

export interface CallCostSnapshotData {
  platformCost: number;
  billableSeconds: number;
  planVersionId: string;
  appliedRate: number;
  appliedMinSec: number;
  appliedIncrementSec: number;
  chargedAmount: number;
}

/** Dispositions assigned to the platform agent behind a call's campaign */
export interface AgentDispositionMap {
  platformAgentId: string | null;
  dispositions: {
    id: string;
    name: string;
    slug: string;
    isObjective: boolean;
    isSubjective: boolean;
  }[];
}

export interface WebhookRepository {
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
      extracted_data?: Record<string, any> | null;
      endedAt: Date;
    },
  ): Promise<void>;

  updateLeadStatus(
    leadId: string,
    status: LeadStatus,
    doNotCall?: boolean,
  ): Promise<void>;

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

  /**
   * Persists the authoritative historical billing snapshot for auditability.
   */
  updateCallCostBreakdown(
    callId: string,
    data: CallCostSnapshotData,
  ): Promise<void>;

  /**
   * Resolves the platform agent behind a call and returns all dispositions
   * assigned to it (via categories M2M + direct M2M).
   * Returns null dispositions array if no platform agent is linked.
   */
  getAgentDispositionsForCall(callId: string): Promise<AgentDispositionMap>;

}
