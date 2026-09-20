import {
  type Disposition,
  type LeadTemperature,
  type LocationMatch,
} from "@prisma/client";
import { type CallEntityData } from "../../domain/entities/call.entity";
import type {
  ExtractionResponse,
  AvailableFiltersResponse,
  DynamicFilterMap,
} from "../../../../shared/types/bolna.types";

export interface ListCallsFilters {
  campaignId?: string;
  leadId?: string;
  status?: string;
  disposition?: string;
  leadTemperature?: string;
  locationMatch?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  dynamicFilters?: DynamicFilterMap;
  metricKey?: string; // e.g., "lead_temperature"
  metricValue?: string; // e.g., "HOT"
}

export interface PaginatedCallsResult {
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
      callAnalysis: {
        id: string;
        disposition: Disposition | null;
        leadTemperature: LeadTemperature | null;
        preferredConfiguration: string | null;
        budgetRange: string | null;
        purchaseTimeline: string | null;
      } | null;
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
    disposition: Disposition | null;
    leadTemperature: LeadTemperature | null;
    preferredConfiguration: string | null;
    budgetRange: string | null;
    purchaseTimeline: string | null;
    purchasePurpose: string | null;
    locationMatch: LocationMatch | null;
    customerLocationPref: string | null;
    preferredNextAction: string | null;
    preferredContactChannel: string | null;
    followupSchedule: string | null;
    doNotCall: string | null;
    languageSupportRequired: string | null;
    dynamicExtractions: string | null;
    extractionResult: string | null;
    extractionResponse: string | null;
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
    disposition: Disposition | null;
    leadTemperature: LeadTemperature | null;
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
  qualifiedCount: number;
  qualificationRate: string;
  dispositionBreakdown: Record<string, number>;
  temperatureBreakdown: Record<string, number>;
}

export interface CallRepository {
  list(
    tenantId: string,
    filters: ListCallsFilters,
  ): Promise<PaginatedCallsResult>;
  findById(tenantId: string, id: string): Promise<DetailedCallResult | null>;
  findTranscriptById(
    tenantId: string,
    id: string,
  ): Promise<CallTranscriptResult | null>;
  getStats(
    tenantId: string,
    filters: CallStatsFilters,
  ): Promise<CallStatsResult>;

  /**
   * Fetches the computed dynamic extraction response for a call.
   * Returns null if the call or its analysis does not exist.
   */
  getExtractionResponse(
    tenantId: string,
    callId: string,
  ): Promise<ExtractionResponse | null>;

  getAvailableFilters(
    tenantId: string,
    campaignId: string,
  ): Promise<AvailableFiltersResponse>;
}
