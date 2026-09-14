import type { Industry } from "@prisma/client";

export interface RegisterPlatformAgentDTO {
  bolnaId: string;
  slug: string;
  name: string;
  industry?: Industry;
  industryPackId?: string;
  category?: string;
  description?: string;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface UpdatePlatformAgentDTO {
  slug?: string;
  name?: string;
  industry?: Industry;
  industryPackId?: string | null;
  category?: string;
  description?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface ListPlatformAgentsFilters {
  industry?: Industry;
  industryPackId?: string;
  isActive?: boolean;
}