// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

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
  industryPackId?: string;
  categoryId?: string;
  isActive?: boolean;
  /** Filter by platform agent assignment */
  platformAgentId?: string;
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
