import type { DynamicFilterMap } from "../../../../shared/types/bolna.types";

export interface ListCallsInput {
  tenantId: string;
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
}