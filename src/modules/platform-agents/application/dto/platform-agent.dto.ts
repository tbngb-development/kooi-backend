export interface RegisterPlatformAgentDTO {
  bolnaId: string;
  slug: string;
  name: string;
  bolnaApiKeyId: string;
  industryPackId?: string;
  category?: string;
  description?: string;
  isFeatured?: boolean;
  sortOrder?: number;
}

export interface UpdatePlatformAgentDTO {
  slug?: string;
  name?: string;
  bolnaApiKeyId?: string;
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

export interface AssignCategoriesToAgentDTO {
  categoryIds: string[];
}

export interface AssignDispositionsToAgentDTO {
  dispositionIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bolna Discovery & Blueprint Preview DTOs (Mapped Layer)
// ─────────────────────────────────────────────────────────────────────────────

export interface BolnaDiscoveredAgent {
  bolnaId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  createdAt: string;
  updatedAt: string;
  alreadyImported: boolean;
  kooiPlatformAgentId: string | null;
  kooiSlug: string | null;
}

export interface BolnaPreviewDisposition {
  bolnaId: string;
  name: string;
  question: string;
  isSubjective: boolean;
  isObjective: boolean;
  alreadyImported: boolean;
}

export interface BolnaPreviewCategory {
  bolnaId: string;
  name: string;
  model: string;
  alreadyImported: boolean;
  dispositions: BolnaPreviewDisposition[];
}

export interface BolnaAgentBlueprintPreview {
  agent: {
    bolnaId: string;
    agentName: string;
    systemPrompt: string;
    defaultConfig: Record<string, unknown>;
    alreadyImported: boolean;
    kooiPlatformAgentId: string | null;
  };
  extractions: BolnaPreviewCategory[];
  extractionSummary: {
    totalCategories: number;
    totalDispositions: number;
    newCategories: number;
    newDispositions: number;
  };
}

export interface ImportFromBolnaInput {
  bolnaId: string;
  bolnaApiKeyId?: string;
  slug?: string;
  name?: string;
  industryPackId?: string;
  category?: string;
  description?: string;
  isFeatured?: boolean;
  sortOrder?: number;
  includeExtractions?: boolean;
}
