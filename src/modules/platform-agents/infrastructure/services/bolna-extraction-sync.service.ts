import type { BolnaExtractionProvider } from "../../../extractions/application/interfaces/bolna-extraction-provider.interface";
import type { BolnaExtractionSyncService } from "../../application/interfaces/bolna-extraction-sync.interface";
import type { BolnaObjectiveOption } from "../../../../shared/types/bolna.types";

export class BolnaExtractionSyncServiceImpl implements BolnaExtractionSyncService {
  constructor(private readonly bolnaProvider: BolnaExtractionProvider) {}

  // ── Category ──────────────────────────────────────────────────────────────

  async ensureBolnaCategory(
    agentBolnaId: string,
    categoryName: string,
    model: string,
  ): Promise<string> {
    // 1. List existing categories for this agent on Bolna
    const existing = await this.bolnaProvider.listCategories(agentBolnaId);
    const categories = existing?.categories ?? [];

    // 2. Find by name (case-insensitive match)
    const match = categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (match) {
      // If model changed, patch it
      if (match.model !== model) {
        const updated = await this.bolnaProvider.updateCategory(match.id, {
          model,
        });
        return updated.id;
      }
      return match.id;
    }

    // 3. Create new category on Bolna
    const created = await this.bolnaProvider.createCategory(agentBolnaId, {
      name: categoryName,
      model,
    });
    return created.id;
  }

  // ── Disposition ───────────────────────────────────────────────────────────

  async syncDispositionToBolna(
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
  ): Promise<string> {
    const payload = {
      agent_id: agentBolnaId,
      name: disposition.name,
      question: disposition.question,
      category_id: bolnaCategoryId,
      system_prompt: disposition.systemPrompt ?? undefined,
      model: disposition.model,
      is_subjective: disposition.isSubjective,
      is_objective: disposition.isObjective,
      subjective_type: disposition.subjectiveType,
      subjective_type_config:
        (disposition.subjectiveTypeConfig as any) ?? undefined,
      objective_options:
        (disposition.objectiveOptions as BolnaObjectiveOption[]) ?? undefined,
    };

    if (existingBolnaDispositionId) {
      // Update existing Bolna disposition (may trigger copy-on-write → new ID)
      const updated = await this.bolnaProvider.updateDisposition(
        existingBolnaDispositionId,
        payload,
      );
      // Bolna may return a new ID if copy-on-write occurred
      return updated.id;
    }

    // Create new disposition on Bolna
    const created = await this.bolnaProvider.createDisposition(payload);
    return created.id;
  }

  // ── Removal ───────────────────────────────────────────────────────────────

  async removeDispositionFromBolna(
    bolnaDispositionId: string,
  ): Promise<string | null> {
    try {
      await this.bolnaProvider.deleteDisposition(bolnaDispositionId);
      return null; // null = success
    } catch (err: any) {
      return (
        err?.response?.data?.message ??
        err?.message ??
        "Unknown Bolna deletion error"
      );
    }
  }
}
