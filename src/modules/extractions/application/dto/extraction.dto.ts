// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractionDisposition } from "@prisma/client";

export interface CreateCategoryDTO {
  name: string;
  model?: string;
  description?: string;
  /** Optional: attach industry packs at creation time */
  industryPackIds?: string[];
  /** Optional: attach dispositions at creation time */
  dispositionIds?: string[];
}

export interface UpdateCategoryDTO {
  name?: string;
  model?: string;
  description?: string;
  isActive?: boolean;
}

export interface ListCategoriesFilters {
  industryPackId?: string;
  isActive?: boolean;
  /** Filter by platform agent assignment */
  platformAgentId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPOSITIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDispositionDTO {
  name: string;
  displayName: string;
  tag?: string;
  question: string;
  systemPrompt?: string;
  model?: string;
  isSubjective?: boolean;
  isObjective?: boolean;
  subjectiveType?: string;
  subjectiveTypeConfig?: Record<string, unknown>;
  objectiveOptions?: Record<string, unknown>[];
  description?: string;
  industryPackIds?: string[];
  showInOverview?: boolean;
  showInInsights?: boolean;
}

export interface UpdateDispositionDTO {
  name?: string;
  displayName?: string;
  tag?: string | null;
  question?: string;
  systemPrompt?: string;
  model?: string;
  isSubjective?: boolean;
  isObjective?: boolean;
  subjectiveType?: string;
  subjectiveTypeConfig?: Record<string, unknown> | null;
  objectiveOptions?: Record<string, unknown>[] | null;
  description?: string;
  isActive?: boolean;
  showInOverview?: boolean;
  showInInsights?: boolean;
}

export interface ListDispositionsFilters {
  // Filters
  industryPackId?: string;
  categoryId?: string;
  platformAgentId?: string;
  tag?: string;
  isActive?: boolean;

  // Search
  search?: string;

  // Sorting
  sortBy?: "name" | "displayName" | "tag" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";

  // Pagination
  page?: number;
  limit?: number;
}

export interface PaginatedDispositionsResult {
  items: ExtractionDisposition[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// M2M ATTACH / DETACH
// ─────────────────────────────────────────────────────────────────────────────

export interface AttachIndustriesDTO {
  industryPackIds: string[];
}

export interface AttachDispositionsDTO {
  dispositionIds: string[];
}

export interface AttachCategoriesDTO {
  categoryIds: string[];
}
