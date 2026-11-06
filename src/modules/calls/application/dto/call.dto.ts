// modules/calls/application/dto/call.dto.ts

import type { VoiceProvider } from "@prisma/client";
import type { DynamicFilterMap } from "../../../../shared/types/bolna.types";

export interface ListCallsInput {
  tenantId: string;
  provider?: VoiceProvider;
  campaignId?: string;
  assistantId?: string;
  leadId?: string;
  status?: string;
  type?: "OUTBOUND" | "INBOUND";
  source?: "CAMPAIGN" | "INBOUND" | "QUICK_DIAL";
  agentNumber?: string;
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
  goalId?: string;
  goalPassed?: boolean;
}