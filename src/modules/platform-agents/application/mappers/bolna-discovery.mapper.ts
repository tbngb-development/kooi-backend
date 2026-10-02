import type {
  BolnaAgentResponse,
  BolnaExtractionCategoryResponse,
} from "../../../../shared/types/bolna.types";
import type {
  BolnaDiscoveredAgent,
  BolnaAgentBlueprintPreview,
  BolnaPreviewCategory,
  BolnaPreviewDisposition,
} from "../dto/platform-agent.dto";
import type { PlatformAgentWithCount } from "../interfaces/platform-agent-repository.interface";
import { getAgentSystemPrompt } from "../../../assistants/infrastructure/promptVariableExtractor";

export class BolnaDiscoveryMapper {
  /**
   * Transforms raw Bolna agent list and merges with local platform-agents database
   */
  static toDiscoveredAgents(
    bolnaAgents: BolnaAgentResponse[],
    existingPlatformAgents: PlatformAgentWithCount[],
  ): BolnaDiscoveredAgent[] {
    const existingMap = new Map<string, PlatformAgentWithCount>();
    for (const pa of existingPlatformAgents) {
      existingMap.set(pa.bolnaId, pa);
    }

    return bolnaAgents.map((agent) => {
      const existing = existingMap.get(agent.id);
      return {
        bolnaId: agent.id,
        agentName: agent.agent_name ?? "Unnamed Agent",
        agentType: agent.agent_type ?? "sales",
        agentStatus: agent.agent_status ?? "active",
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
        alreadyImported: Boolean(existing),
        kooiPlatformAgentId: existing ? existing.id : null,
        kooiSlug: existing ? existing.slug : null,
      };
    });
  }

  /**
   * Transforms raw Bolna agent details and extractions into Blueprint Preview
   */
  static toBlueprintPreview(params: {
    agent: BolnaAgentResponse;
    existingPlatformAgent: { id: string; slug: string } | null;
    rawCategories: BolnaExtractionCategoryResponse[];
    existingCategorySlugs: Set<string>;
    existingDispositionSlugs: Set<string>;
  }): BolnaAgentBlueprintPreview {
    const {
      agent,
      existingPlatformAgent,
      rawCategories,
      existingCategorySlugs,
      existingDispositionSlugs,
    } = params;

    let totalCategories = 0;
    let totalDispositions = 0;
    let newCategories = 0;
    let newDispositions = 0;

    const mappedCategories: BolnaPreviewCategory[] = (rawCategories || []).map(
      (cat) => {
        totalCategories += 1;
        const catSlug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const categoryAlreadyImported = existingCategorySlugs.has(catSlug);

        if (!categoryAlreadyImported) {
          newCategories += 1;
        }

        const mappedDispositions: BolnaPreviewDisposition[] = (
          cat.dispositions || []
        ).map((disp) => {
          totalDispositions += 1;
          const dispSlug = disp.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const dispAlreadyImported = existingDispositionSlugs.has(dispSlug);

          if (!dispAlreadyImported) {
            newDispositions += 1;
          }

          return {
            bolnaId: disp.id,
            name: disp.name,
            question: disp.question,
            isSubjective: disp.is_subjective ?? false,
            isObjective: disp.is_objective ?? false,
            alreadyImported: dispAlreadyImported,
          };
        });

        return {
          bolnaId: cat.id,
          name: cat.name,
          model: cat.model ?? "gpt-4.1-mini",
          alreadyImported: categoryAlreadyImported,
          dispositions: mappedDispositions,
        };
      },
    );

    return {
      agent: {
        bolnaId: agent.id,
        agentName: agent.agent_name,
        systemPrompt: getAgentSystemPrompt(agent),
        defaultConfig: agent as unknown as Record<string, unknown>,
        alreadyImported: Boolean(existingPlatformAgent),
        kooiPlatformAgentId: existingPlatformAgent
          ? existingPlatformAgent.id
          : null,
      },
      extractions: mappedCategories,
      extractionSummary: {
        totalCategories,
        totalDispositions,
        newCategories,
        newDispositions,
      },
    };
  }
}
