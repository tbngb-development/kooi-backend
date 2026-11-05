import type { CallStatus, LeadStatus, VoiceProvider } from "@prisma/client";
import type { RecordingRetrievalStatus } from "../../../calls/domain/errors/sarvam-recording.errors";

export interface AggregateCallCandidate {
  id: string;
  tenantId: string;
  campaignId: string | null;
  leadId: string;
  batchId: string | null;
  provider: VoiceProvider | null;
  status: CallStatus;
  sarvamAttemptId: string | null;
  sarvamInteractionId: string | null;
  sarvamUserIdentifier: string | null;
  duration: number | null;
  recording: string | null;
  transcript: string | null;
  transcriptMessages: unknown;
  callHistory: unknown;
  extractionResult: unknown;
  startedAt: Date | null;
  endedAt: Date | null;
  agentNumber: string | null;
  cost?: number | null;
  platformCost?: number | null;
  billableSeconds?: number | null;
  planVersionId?: string | null;
  appliedRate?: number | null;
  appliedMinSec?: number | null;
  appliedIncrementSec?: number | null;
  chargedAmount?: number | null;
}

export interface SarvamAttemptHistoryEntry {
  attempt_id: string;
  interaction_id?: string | null;
  user_identifier: string;
  retry_attempt: number;
  connectivity_status?: string | null;
  completion_status: string;
  next_action_status?: string | null;
  failure_reason?: string | null;
  duration?: number | null;
  executed_at?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  timestamp: string;
  status: string;
  initial_agent_variables?: Record<string, unknown> | null;
  final_agent_variables?: Record<string, unknown> | null;
  output_agent_variables?: Record<string, unknown> | null;
  transcript?: string | null;
  metadata?: Record<string, unknown> | null;
  // Recording tracking fields
  recording_url?: string | null;
  recording_storage_key?: string | null;
  recording_status?: RecordingRetrievalStatus;
  recording_error?: string | null;
  recording_attempts?: number;
  recording_retrieved_at?: string | null;
  recording_source?: "AUTOMATIC" | "MANUAL" | null;
  cost?: number | null;
  platformCost?: number | null;
  billableSeconds?: number | null;
  chargedAmount?: number | null;
}

export interface CreateAggregateCallData {
  tenantId: string;
  campaignId: string;
  batchId: string;
  leadId: string;
  sarvamAgentId: string;
  provider: VoiceProvider;
  status: CallStatus;
  sarvamAttemptId: string;
  sarvamInteractionId?: string | null;
  sarvamUserIdentifier: string;
  callHistory: SarvamAttemptHistoryEntry[];
  agentNumber?: string | null;
  duration?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  transcript?: string | null;
  transcriptMessages?: unknown | null;
  extractionResult?: unknown | null;
  cost?: number | null;
  platformCost?: number | null;
  billableSeconds?: number | null;
  planVersionId?: string | null;
  appliedRate?: number | null;
  appliedMinSec?: number | null;
  appliedIncrementSec?: number | null;
  chargedAmount?: number | null;
}

export interface UpdateAggregateCallData {
  status: CallStatus;
  sarvamAttemptId: string;
  sarvamInteractionId?: string | null;
  sarvamUserIdentifier: string;
  callHistory: SarvamAttemptHistoryEntry[];
  agentNumber?: string | null;
  duration?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  transcript?: string | null;
  transcriptMessages?: unknown | null;
  extractionResult?: unknown | null;
  cost?: number | null;
  platformCost?: number | null;
  billableSeconds?: number | null;
  planVersionId?: string | null;
  appliedRate?: number | null;
  appliedMinSec?: number | null;
  appliedIncrementSec?: number | null;
  chargedAmount?: number | null;
}

export interface ISarvamWebhookRepository {
  executeInAdvisoryLock<T>(
    lockKey: string,
    operation: (txRepo: ISarvamWebhookRepository) => Promise<T>,
  ): Promise<T>;

  findAggregateCall(
    leadId: string,
    campaignId: string,
  ): Promise<AggregateCallCandidate | null>;

  createAggregateCall(
    data: CreateAggregateCallData,
  ): Promise<AggregateCallCandidate>;

  updateAggregateCall(
    callId: string,
    data: UpdateAggregateCallData,
  ): Promise<void>;

  updateLeadStatus(leadId: string, status: LeadStatus): Promise<void>;

  findSarvamAgentForTenant(
    agentId: string,
    tenantId: string,
  ): Promise<{ id: string; outputVariables: unknown } | null>;

  getCallAnalysis(
    callId: string,
  ): Promise<{ id: string; outputVariables: unknown } | null>;

  upsertCallAnalysisOutputVariables(
    callId: string,
    tenantId: string,
    outputVariables: Array<{ key: string; value: unknown }>,
  ): Promise<void>;
}
