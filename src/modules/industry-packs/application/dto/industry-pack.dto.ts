import type { Industry } from "@prisma/client";

export interface CreateIndustryPackDTO {
  slug: string;
  name: string;
  industry: Industry;
  description?: string;
  icon?: string;
  allowedCallingHours?: Record<string, unknown> | null;
  requiresConsent?: boolean;
}

export interface UpdateIndustryPackDTO {
  slug?: string;
  name?: string;
  description?: string;
  icon?: string;
  allowedCallingHours?: Record<string, unknown> | null;
  requiresConsent?: boolean;
  isActive?: boolean;
}

export interface ListIndustryPacksFilters {
  isActive?: boolean;
}