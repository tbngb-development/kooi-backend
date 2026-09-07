import {
  type Disposition,
  type LeadTemperature,
  type LocationMatch,
} from "@prisma/client";
import { type CallEntityData } from "../../domain/entities/call.entity";

export interface ListCallsFilters {
  campaignId?: string;
  leadId?: string;
  status?: string; // Comma-separated or single
  disposition?: string; // Comma-separated or single
  leadTemperature?: string; // Comma-separated or single
  locationMatch?: string; // Comma-separated or single
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
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
}
