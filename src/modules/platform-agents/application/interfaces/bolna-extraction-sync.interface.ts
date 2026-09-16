import type { AgentExtractionConfig } from "./platform-agent-repository.interface";

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

/** Full sync report returned to the caller */
export interface BolnaSyncReport {
  platformAgentId: string;
  bolnaAgentId: string;
  synced: SyncedDispositionResult[];
  removed: RemovedDispositionResult[];
  errors: {
    dispositionId: string;
    dispositionName: string;
    error: string;
  }[];
  summary: {
    totalAssigned: number;
    created: number;
    updated: number;
    removed: number;
    failed: number;
  };
}

/**
 * Encapsulates all Bolna extraction API interactions for a single agent sync.
 * Stateless — each method receives the IDs it needs.
 */
export interface BolnaExtractionSyncService {
  /**
   * Ensures a category exists on Bolna for the given agent.
   * If a category with the same name already exists, returns its ID.
   * Otherwise creates a new one.
   */
  ensureBolnaCategory(
    agentBolnaId: string,
    categoryName: string,
    model: string,
  ): Promise<string>;

  /**
   * Creates or updates a single disposition on Bolna.
   * Returns the Bolna disposition ID (may change due to copy-on-write).
   */
  syncDispositionToBolna(
    agentBolnaId: string,
    bolnaCategoryId: string,
    disposition: {
      id: string;
      name: string;
      question: string;
      systemPrompt: string | null;
      model: string;
      isSubjective: boolean;
      isObjective: boolean;
      subjectiveType: string;
      subjectiveTypeConfig: unknown;
      objectiveOptions: unknown;
    },
    existingBolnaDispositionId: string | null,
  ): Promise<string>;

  /**
   * Deletes a disposition from Bolna.
   * Best-effort — returns error message instead of throwing.
   */
  removeDispositionFromBolna(
    bolnaDispositionId: string,
  ): Promise<string | null>;
}
