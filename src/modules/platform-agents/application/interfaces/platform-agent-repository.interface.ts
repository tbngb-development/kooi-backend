import type {
  PlatformAgent,
  IndustryPack,
  AgentBolnaExtractionBinding,
} from "@prisma/client";
import type {
  RegisterPlatformAgentDTO,
  UpdatePlatformAgentDTO,
  ListPlatformAgentsFilters,
} from "../dto/platform-agent.dto";

export type PlatformAgentWithCount = PlatformAgent & {
  industryPack?: IndustryPack | null;
  _count: {
    assistants: number;
    categories: number;
  };
};

/** Minimal objective option shape for extraction config validation */
export interface DispositionObjectiveOption {
  value: string;
  condition: string;
  sub_options?: DispositionObjectiveOption[];
}

export interface AgentExtractionConfig {
  platformAgentId: string;
  bolnaId: string;
  bolnaApiKeyId: string;
  categories: {
    categoryId: string;
    categoryName: string;
    categorySlug: string;
    model: string;
    sortOrder: number;
    dispositions: {
      dispositionId: string;
      dispositionName: string;
      dispositionSlug: string;
      sortOrder: number;
      isObjective: boolean;
      isSubjective: boolean;
      objectiveOptions: DispositionObjectiveOption[] | null;
    }[];
  }[];
  bolnaBindings: AgentBolnaExtractionBinding[];
}

export interface UpdateAgentVariablesData {
  requiredVariables?: unknown;
}

export interface PlatformAgentRepository {
  create(
    data: RegisterPlatformAgentDTO & {
      defaultConfig: unknown;
      systemPrompt: string | null;
    },
  ): Promise<PlatformAgent>;

  update(
    id: string,
    data: UpdatePlatformAgentDTO & {
      defaultConfig?: unknown;
      systemPrompt?: string | null;
    },
  ): Promise<PlatformAgent>;

  findById(id: string): Promise<PlatformAgentWithCount | null>;
  findBySlug(slug: string): Promise<PlatformAgent | null>;
  findByBolnaId(bolnaId: string): Promise<PlatformAgent | null>;
  list(filters: ListPlatformAgentsFilters): Promise<PlatformAgentWithCount[]>;
  delete(id: string): Promise<void>;

  // ── Extraction: Category Assignment ───────────────────────────────────────
  assignCategoriesToAgent(
    platformAgentId: string,
    categoryIds: string[],
  ): Promise<void>;
  removeCategoryFromAgent(
    platformAgentId: string,
    categoryId: string,
  ): Promise<void>;
  removeAllCategoriesFromAgent(platformAgentId: string): Promise<void>;

  // ── Extraction: Full Config ───────────────────────────────────────────────
  getAgentExtractionConfig(
    platformAgentId: string,
  ): Promise<AgentExtractionConfig | null>;

  updateAgentVariables(
    platformAgentId: string,
    data: UpdateAgentVariablesData,
  ): Promise<PlatformAgent>;

  // ── Bolna Bindings ────────────────────────────────────────────────────────
  upsertBolnaBinding(data: {
    platformAgentId: string;
    dispositionId: string;
    bolnaAgentId: string;
    bolnaCategoryId: string;
    bolnaDispositionId: string;
  }): Promise<AgentBolnaExtractionBinding>;
  deleteBolnaBindings(
    platformAgentId: string,
    dispositionIds: string[],
  ): Promise<void>;
  deleteAllBolnaBindings(platformAgentId: string): Promise<void>;
  getBolnaBindings(
    platformAgentId: string,
  ): Promise<AgentBolnaExtractionBinding[]>;
}
