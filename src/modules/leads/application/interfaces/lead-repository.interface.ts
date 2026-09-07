import {
  type CallStatus,
  type Disposition,
} from "@prisma/client";
import { type LeadEntityData } from "../../domain/entities/lead.entity";

export interface ListLeadsFilters {
  campaignId?: string;
  status?: string; // Comma-separated or single
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface PaginatedLeadsResult {
  leads: Array<
    LeadEntityData & {
      campaign: {
        id: string;
        name: string;
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

export interface DetailedLeadResult extends LeadEntityData {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  } | null;
  calls: Array<{
    id: string;
    bolnaCallId: string | null;
    status: CallStatus;
    duration: number | null;
    cost: number | null;
    recording: string | null;
    transcript: string | null;
    summary: string | null;
    createdAt: Date;
    callAnalysis: {
      id: string;
      disposition: Disposition | null;
      leadTemperature: string | null;
      preferredConfiguration: string | null;
      budgetRange: string | null;
      purchaseTimeline: string | null;
      preferredNextAction: string | null;
    } | null;
  }>;
}

export interface LeadStatsResult {
  total: number;
  pending: number;
  calling: number;
  called: number;
  failed: number;
  noAnswer: number;
  doNotCall: number;
  qualified: number;
  qualificationRate: string;
}

export interface LeadRepository {
  list(
    tenantId: string,
    filters: ListLeadsFilters,
  ): Promise<PaginatedLeadsResult>;
  findById(tenantId: string, id: string): Promise<DetailedLeadResult | null>;
  getStats(tenantId: string, campaignId?: string): Promise<LeadStatsResult>;
}
