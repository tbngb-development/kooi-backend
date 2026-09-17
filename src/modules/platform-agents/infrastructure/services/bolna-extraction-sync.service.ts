import type { BolnaExtractionProvider } from "../../../extractions/application/interfaces/bolna-extraction-provider.interface";
import type {
  AgentExtractionConfig,
  PlatformAgentRepository,
} from "../../application/interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type {
  BolnaExtractionSyncService,
  BolnaSyncReport,
  RemoteBolnaCategory,
} from "../../application/interfaces/bolna-extraction-sync.interface";

export class BolnaExtractionSyncServiceImpl implements BolnaExtractionSyncService {
  constructor(private readonly extractionProvider: BolnaExtractionProvider) {}

  async syncAgentExtractions(
    config: AgentExtractionConfig,
    _extractionRepo: ExtractionRepository,
    _agentRepo: PlatformAgentRepository,
  ): Promise<BolnaSyncReport> {
    return {
      platformAgentId: config.platformAgentId,
      bolnaAgentId: config.bolnaId,
      synced: [],
      removed: [],
      errors: [],
      summary: {
        totalAssigned: 0,
        categoriesCreated: 0,
        created: 0,
        updated: 0,
        removed: 0,
        failed: 0,
      },
    };
  }

  // ── List remote categories (for dedup) ──────────────────────────────────

  async listRemoteCategories(
    agentId: string,
    bolnaApiKeyId?: string,
  ): Promise<RemoteBolnaCategory[]> {
    const response = await this.extractionProvider.listCategories(
      agentId,
      bolnaApiKeyId,
    );
    return (response.categories ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
    }));
  }

  // ── Create category ONLY if it doesn't exist ────────────────────────────

  async ensureBolnaCategory(
    agentId: string,
    categoryName: string,
    model: string,
    bolnaApiKeyId?: string,
  ): Promise<string> {
    // Check if category already exists on this agent
    const remoteCats = await this.listRemoteCategories(agentId, bolnaApiKeyId);
    const existing = remoteCats.find(
      (c) => c.name.toLowerCase().trim() === categoryName.toLowerCase().trim(),
    );

    if (existing) {
      return existing.id; // ✅ Reuse — don't create duplicate
    }

    // Create only if truly missing
    const created = await this.extractionProvider.createCategory(
      agentId,
      { name: categoryName, model },
      bolnaApiKeyId,
    );
    return created.id;
  }

  // ── Create NEW disposition on Bolna ─────────────────────────────────────

  async syncDispositionToBolna(
    agentId: string,
    categoryId: string,
    disposition: any,
    bolnaApiKeyId?: string,
  ): Promise<string> {
    const created = await this.extractionProvider.createDisposition(
      {
        agent_id: agentId,
        category_id: categoryId, 
        name: disposition.name,
        question: disposition.question,
        system_prompt: disposition.systemPrompt,
        model: disposition.model ?? "gpt-4.1-mini",
        is_subjective: disposition.isSubjective ?? false,
        is_objective: disposition.isObjective ?? false,
        subjective_type: disposition.subjectiveType ?? "text",
        subjective_type_config: disposition.subjectiveTypeConfig ?? undefined,
        objective_options: disposition.objectiveOptions ?? undefined,
      },
      bolnaApiKeyId,
    );
    return created.id;
  }

  // ── Update EXISTING disposition (PUT, copy-on-write aware) ──────────────

  async updateDispositionOnBolna(
    bolnaDispositionId: string,
    disposition: any,
    bolnaApiKeyId?: string,
  ): Promise<void> {
    await this.extractionProvider.updateDisposition(
      bolnaDispositionId,
      {
        name: disposition.name,
        question: disposition.question,
        system_prompt: disposition.systemPrompt ?? undefined,
        model: disposition.model ?? "gpt-4.1-mini",
        is_subjective: disposition.isSubjective ?? false,
        is_objective: disposition.isObjective ?? false,
        subjective_type: disposition.subjectiveType ?? "text",
        subjective_type_config: disposition.subjectiveTypeConfig ?? undefined,
        objective_options: disposition.objectiveOptions ?? undefined,
      },
      bolnaApiKeyId,
    );
  }

  // ── Remove (best-effort) ────────────────────────────────────────────────

  async removeDispositionFromBolna(
    dispositionId: string,
    bolnaApiKeyId?: string,
  ): Promise<string | null> {
    try {
      await this.extractionProvider.deleteDisposition(
        dispositionId,
        bolnaApiKeyId,
      );
      return null;
    } catch (err: any) {
      return err.message;
    }
  }
}
