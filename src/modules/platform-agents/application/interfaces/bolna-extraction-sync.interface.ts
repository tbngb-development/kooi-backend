import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  AgentExtractionConfig,
  PlatformAgentRepository,
} from "./platform-agent-repository.interface";

export interface SyncedDispositionResult {
  dispositionId: string;
  dispositionName: string;
  bolnaDispositionId: string;
  bolnaCategoryId: string;
  action: "created" | "updated";
}

export interface RemovedDispositionResult {
  dispositionId: string;
  bolnaDispositionId: string;
  action: "removed";
  error?: string;
}

export interface SyncError {
  dispositionId: string;
  dispositionName: string;
  error: string;
}

export interface BolnaSyncReport {
  platformAgentId: string;
  bolnaAgentId: string;
  synced: SyncedDispositionResult[];
  removed: RemovedDispositionResult[];
  errors: SyncError[];
  summary: {
    totalAssigned: number;
    categoriesCreated: number;
    created: number;
    updated: number;
    removed: number;
    failed: number;
  };
}

/** Lightweight remote category shape for dedup checks */
export interface RemoteBolnaCategory {
  id: string;
  name: string;
}

export interface BolnaExtractionSyncService {
  syncAgentExtractions(
    config: AgentExtractionConfig,
    extractionRepo: ExtractionRepository,
    agentRepo: PlatformAgentRepository,
  ): Promise<BolnaSyncReport>;

  /** List categories already on Bolna (for dedup) */
  listRemoteCategories(
    agentId: string,
    bolnaApiKeyId?: string,
  ): Promise<RemoteBolnaCategory[]>;

  ensureBolnaCategory(
    agentId: string,
    categoryName: string,
    model: string,
    bolnaApiKeyId?: string,
  ): Promise<string>;

  syncDispositionToBolna(
    agentId: string,
    categoryId: string,
    disposition: any,
    bolnaApiKeyId?: string,
  ): Promise<string>;

  /** Update an existing Bolna disposition in-place (no duplicate) */
  updateDispositionOnBolna(
    bolnaDispositionId: string,
    disposition: any,
    bolnaApiKeyId?: string,
  ): Promise<void>;

  removeDispositionFromBolna(
    dispositionId: string,
    bolnaApiKeyId?: string,
  ): Promise<string | null>;
}
