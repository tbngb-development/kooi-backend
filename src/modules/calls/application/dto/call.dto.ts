import type { DynamicFilterMap } from "../../../../shared/types/bolna.types";
import type { CallSource } from "@prisma/client";

export interface ListCallsInput {
  tenantId: string;
  campaignId?: string;
  leadId?: string;
  source?: CallSource;
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
  isDeleted?: boolean;
}