// modules/calls/application/interfaces/call-repository.interface.ts

import { type CallEntityData } from "../../domain/entities/call.entity";
import type {
  AvailableFiltersResponse,
  DynamicFilterMap,
} from "../../../../shared/types/bolna.types";
import type { CallListOverview } from "../../../campaigns/application/dto/campaign.dto";

export interface ListCallsFilters {
  campaignId?: string;
  leadId?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  dynamicFilters?: DynamicFilterMap;
  includeDeleted?: boolean;
}

export interface PaginatedCallsResult {
  overview: CallListOverview;
  calls: Array<
    CallEntityData & {
      lead: {
        id: string;
        name: string | null;
        phone: string;
      } | null;
      campaign: {
        id: string;
        name: string;
      } | null;
      extractionOverview: {
        dispositionSlug: string;
        objectiveValue: string;
        dispositionName: string;
        categoryName: string;
        confidence: number | null;
      }[];
      extractionInsights: {
        dispositionSlug: string;
        dispositionName: string;
        categoryName: string;
        confidence: number | null;
        subjectiveValue: string;
        normalizedValue: string;
      }[];
    }
  >;
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface DetailedCallResult extends CallEntityData {
  lead: {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    company: string | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  callAnalysis: {
    id: string;
    dynamicExtractions: string | null;
    extractionResult: string | null;
  } | null;
}

export interface CallTranscriptResult {
  transcript: string | null;
  transcriptMessages: unknown | null;
  summary: string | null;
  duration: number | null;
  recording: string | null;
  callAnalysis: {
    id: string;
  } | null;
}

export interface CallStatsFilters {
  campaignId?: string;
  leadId?: string;
}

export interface CallStatsResult {
  total: number;
  completed: number;
  failed: number;
  noAnswer: number;
  busy: number;
  avgDuration: number;
}

export interface CallRepository {
  list(
    tenantId: string,
    filters: ListCallsFilters,
  ): Promise<PaginatedCallsResult>;

  findById(
    tenantId: string,
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DetailedCallResult | null>;

  findTranscriptById(
    tenantId: string,
    id: string,
  ): Promise<CallTranscriptResult | null>;

  getStats(
    tenantId: string,
    filters: CallStatsFilters,
  ): Promise<CallStatsResult>;

  getTenantCallOverview(tenantId: string): Promise<CallListOverview>;

  getAvailableFilters(
    tenantId: string,
    campaignId: string,
  ): Promise<AvailableFiltersResponse>;

  softDelete(callId: string): Promise<void>;

  restore(callId: string): Promise<void>;

  findInboundLeadContext(
    agentId: string,
    phone: string,
  ): Promise<{
    lead: {
      id: string;
      name: string | null;
      phone: string;
      email: string | null;
      company: string | null;
      metadata: Record<string, unknown> | null;
    };
    campaign: {
      id: string;
      name: string;
      variables: Record<string, string> | null;
      tenantId: string;
    };
  } | null>;
}
