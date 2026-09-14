import type { Industry } from "@prisma/client";

// ── Category DTOs ────────────────────────────────────────────────────────

export interface CreateCategoryDTO {
  slug: string;
  name: string;
  model?: string;
  industry: Industry;
  description?: string;
  platformAgentId?: string;
}

export interface UpdateCategoryDTO {
  slug?: string;
  name?: string;
  model?: string;
  industry?: Industry;
  description?: string;
  isActive?: boolean;
  platformAgentId?: string;
}

export interface ListCategoriesFilters {
  industry?: Industry;
  isActive?: boolean;
  platformAgentId?: string;
}

// ── Disposition DTOs ─────────────────────────────────────────────────────

export interface CreateDispositionDTO {
  slug: string;
  name: string;
  question: string;
  systemPrompt?: string;
  model?: string;
  isSubjective?: boolean;
  isObjective?: boolean;
  subjectiveType?: string;
  subjectiveTypeConfig?: Record<string, unknown> | null;
  objectiveOptions?: unknown[] | null;
  industry: Industry;
  description?: string;
  categoryId: string;
}

export interface UpdateDispositionDTO {
  slug?: string;
  name?: string;
  question?: string;
  systemPrompt?: string;
  model?: string;
  isSubjective?: boolean;
  isObjective?: boolean;
  subjectiveType?: string;
  subjectiveTypeConfig?: Record<string, unknown> | null;
  objectiveOptions?: unknown[] | null;
  industry?: Industry;
  description?: string;
  isActive?: boolean;
  categoryId?: string;
}

export interface ListDispositionsFilters {
  industry?: Industry;
  isActive?: boolean;
  categoryId?: string;
}