import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import { ExtractionPlatformAgentRequiredError } from "../../domain/errors/extraction.errors";
import prisma from "../../../../shared/config/database/prisma";

export class ListBolnaCategoriesUseCase {
  constructor(private readonly bolnaProvider: BolnaExtractionProvider) {}

  async execute(platformAgentId: string) {
    const agent = await prisma.platformAgent.findUnique({
      where: { id: platformAgentId },
    });
    if (!agent?.bolnaId) throw new ExtractionPlatformAgentRequiredError();

    const bolnaData = await this.bolnaProvider.listCategories(agent.bolnaId);
    const categories = bolnaData.categories ?? [];

    // Check which are already imported
    const importedBolnaIds = new Set(
      (
        await prisma.extractionCategory.findMany({
          where: { bolnaId: { not: null } },
          select: { bolnaId: true },
        })
      ).map((c) => c.bolnaId),
    );

    return categories.map((cat) => ({
      bolnaId: cat.id,
      name: cat.name,
      model: cat.model,
      agentId: cat.agent_id,
      dispositionCount: cat.dispositions?.length ?? 0,
      alreadyImported: importedBolnaIds.has(cat.id),
      dispositions: (cat.dispositions ?? []).map((d) => ({
        bolnaId: d.id,
        name: d.name,
        question: d.question,
        isSubjective: d.is_subjective,
        isObjective: d.is_objective,
        alreadyImported: false, // checked at category level for simplicity
      })),
    }));
  }
}
