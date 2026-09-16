export interface RegisterPlatformAgentDTO {
  bolnaId: string;
  slug: string;
  name: string;
  industryPackId?: string;
  category?: string;
  description?: string;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface UpdatePlatformAgentDTO {
  slug?: string;
  name?: string;
  industryPackId?: string | null;
  category?: string;
  description?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface ListPlatformAgentsFilters {
  industryPackId?: string;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction Assignment DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface AssignCategoriesToAgentDTO {
  categoryIds: string[];
}

export interface AssignDispositionsToAgentDTO {
  /**
   * Disposition IDs to assign to this agent.
   * They will be placed in the agent's "General" category (auto-created per industry).
   */
  dispositionIds: string[];
}
