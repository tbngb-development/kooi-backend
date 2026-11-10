import type { BatchStatus, CampaignStatus, CallStatus, LeadStatus, LeadStopReason, VoiceProvider } from "@prisma/client";
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
  goalPassed?: boolean;
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
  recording_source?: string | null;
  chargedAmount?: number | null;
  billableSeconds?: number | null;
  platformCost?: number | null;
}

export interface CreateAggregateCallData {
  tenantId: string;
  campaignId: string;
  batchId: string;
  leadId: string;
  sarvamAgentId?: string | null;
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
  goalPassed?: boolean;
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
  goalPassed?: boolean;
}

export interface CampaignGoalSnapshot {
  id: string;
  campaignId: string;
  outputVariableName: string;
  expectedValue: string;
  displayName: string;
}

export interface ISarvamWebhookRepository {
  executeInAdvisoryLock<T>(
    lockKey: string,
    operation: (txRepo: ISarvamWebhookRepository) => Promise<T>,
  ): Promise<T>;

  findAggregateCall(
    leadId: string,
    batchId: string,
  ): Promise<AggregateCallCandidate | null>;

  createAggregateCall(
    data: CreateAggregateCallData,
  ): Promise<AggregateCallCandidate>;

  updateAggregateCall(
    callId: string,
    data: UpdateAggregateCallData,
  ): Promise<void>;

  updateLeadStatus(leadId: string, status: LeadStatus): Promise<void>;

  countActiveLeadsInBatch(batchId: string): Promise<number>;

  countActiveCallsInBatch(batchId: string): Promise<number>;

  getBatchWithRetryConfig(
    batchId: string,
  ): Promise<{
    id: string;
    status: BatchStatus;
    retryConfig: unknown;
    campaignId: string;
    campaign?: {
      status: CampaignStatus;
      endTimestamp: Date | null;
    } | null;
  } | null>;

  markPendingLeadsAsStopped?(
    batchId: string,
    reason: LeadStopReason,
  ): Promise<number>;

  countStoppedLeadsInBatch?(batchId: string): Promise<number>;

  getCallsInBatch(
    batchId: string,
  ): Promise<Array<{ id: string; status: CallStatus; callHistory: unknown }>>;

  updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    completedAt?: Date,
  ): Promise<void>;

  getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]>;

  updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    completedAt?: Date,
  ): Promise<void>;

  recalculateCampaignStats(campaignId: string): Promise<void>;

  findSarvamAgentForTenant(
    agentId: string,
    tenantId: string,
  ): Promise<{ id: string; outputVariables: unknown } | null>;

  findCampaignGoals(campaignId: string): Promise<CampaignGoalSnapshot[]>;

  upsertCallGoalResults(
    callId: string,
    matchedGoals: Array<{ campaignGoalId: string; attemptId: string }>,
  ): Promise<void>;

  markCallGoalPassed(callId: string): Promise<void>;

  getCallAnalysis(
    callId: string,
  ): Promise<{ id: string; outputVariables: unknown } | null>;

  upsertCallAnalysisOutputVariables(
    callId: string,
    tenantId: string,
    outputVariables: Array<{ key: string; value: unknown }>,
  ): Promise<void>;
}
