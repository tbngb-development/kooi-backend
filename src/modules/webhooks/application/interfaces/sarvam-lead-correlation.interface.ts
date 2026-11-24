import type {
  VoiceProvider,
  CampaignStatus,
  BatchStatus,
  LeadStatus,
} from "@prisma/client";

export interface CorrelateSarvamLeadInput {
  sarvamCampaignId: string;
  sarvamCohortId: string;
  userPhoneNumber: string;
  userIdentifier?: string | null;
}

export interface CorrelatedLeadContext {
  tenantId: string;
  campaign: {
    id: string;
    name: string;
    provider: VoiceProvider;
    sarvamCampaignId: string;
    sarvamAgentId: string;
    status: CampaignStatus;
  };
  batch: {
    id: string;
    name: string | null;
    provider: VoiceProvider;
    sarvamCohortId: string;
    status: BatchStatus;
  };
  lead: {
    id: string;
    phone: string;
    name: string | null;
    status: LeadStatus;
    metadata: Record<string, unknown> | null;
  };
  normalizedPhone: string;
}

export type CorrelationFailureCode =
  | "MISSING_PHONE_NUMBER"
  | "INVALID_PHONE_NUMBER"
  | "UNKNOWN_CAMPAIGN"
  | "CAMPAIGN_DELETED"
  | "INVALID_PROVIDER"
  | "INACTIVE_PROVIDER_CONFIG"
  | "UNKNOWN_COHORT"
  | "BATCH_DELETED"
  | "COHORT_CAMPAIGN_MISMATCH"
  | "TENANT_MISMATCH"
  | "LEAD_NOT_FOUND"
  | "LEAD_DELETED"
  | "AMBIGUOUS_LEAD_MATCH"
  | "AMBIGUOUS_CAMPAIGN_MATCH"
  | "AMBIGUOUS_BATCH_MATCH";

export interface CorrelationFailure {
  code: CorrelationFailureCode;
  message: string;
  details?: Record<string, unknown>;
}

export type SarvamLeadCorrelationResult =
  | { success: true; data: CorrelatedLeadContext }
  | { success: false; failure: CorrelationFailure };

export interface CampaignCorrelationCandidate {
  id: string;
  name: string;
  tenantId: string;
  provider: VoiceProvider | null;
  sarvamCampaignId: string | null;
  sarvamAgentId: string | null;
  status: CampaignStatus;
  isDeleted: boolean;
  sarvamAgent?: {
    id: string;
    status: string;
  } | null;
}

export interface BatchCorrelationCandidate {
  id: string;
  name: string | null;
  tenantId: string;
  campaignId: string;
  provider: VoiceProvider | null;
  sarvamCohortId: string | null;
  status: BatchStatus;
  isDeleted: boolean;
}

export interface LeadCorrelationCandidate {
  id: string;
  phone: string;
  name: string | null;
  status: LeadStatus;
  tenantId: string;
  campaignId: string | null;
  batchId: string | null;
  metadata: unknown;
  isDeleted: boolean;
}

export interface ISarvamLeadCorrelationRepository {
  findCampaignsBySarvamId(
    sarvamCampaignId: string,
  ): Promise<CampaignCorrelationCandidate[]>;
  findBatchesBySarvamCohortId(
    sarvamCohortId: string,
  ): Promise<BatchCorrelationCandidate[]>;
  findLeadsByBatchAndPhone(
    batchId: string,
    normalizedPhone: string,
  ): Promise<LeadCorrelationCandidate[]>;
  findLeadsByCampaignAndPhone(
    campaignId: string,
    normalizedPhone: string,
  ): Promise<LeadCorrelationCandidate[]>;
}

