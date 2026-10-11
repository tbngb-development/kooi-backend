export interface ListLeadsInput {
  tenantId: string;
  campaignId?: string;
  source?: "CAMPAIGN" | "NON_CAMPAIGN" | "ALL";
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  isDeleted?: boolean;
}

