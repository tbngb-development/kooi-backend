import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  AgentExtractionConfig,
  PlatformAgentRepository,
} from "./platform-agent-repository.interface";

/** Result of syncing a single disposition to Bolna */
export interface SyncedDispositionResult {
  dispositionId: string;
  dispositionName: string;
  bolnaDispositionId: string;
  bolnaCategoryId: string;
  action: "created" | "updated";
}

/** Result of removing a stale disposition from Bolna */
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

/** Full sync report returned to the caller */
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

export interface BolnaExtractionSyncService {
  syncAgentExtractions(
    config: AgentExtractionConfig,
    extractionRepo: ExtractionRepository,
    agentRepo: PlatformAgentRepository,
  ): Promise<BolnaSyncReport>;

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

  removeDispositionFromBolna(
    dispositionId: string,
    bolnaApiKeyId?: string,
  ): Promise<string | null>;
}
