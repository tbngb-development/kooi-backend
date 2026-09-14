import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import prisma from "../../../../shared/config/database/prisma";

export class ListBolnaDispositionsUseCase {
  constructor(private readonly bolnaProvider: BolnaExtractionProvider) {}

  async execute(platformAgentId?: string) {
    let agentBolnaId: string | undefined;

    if (platformAgentId) {
      const agent = await prisma.platformAgent.findUnique({
        where: { id: platformAgentId },
      });
      agentBolnaId = agent?.bolnaId;
    }

    const dispositions =
      await this.bolnaProvider.listDispositions(agentBolnaId);

    const importedBolnaIds = new Set(
      (
        await prisma.extractionDisposition.findMany({
          where: { bolnaId: { not: null } },
          select: { bolnaId: true },
        })
      ).map((d) => d.bolnaId),
    );

    return dispositions.map((disp) => ({
      bolnaId: disp.id,
      name: disp.name,
      question: disp.question,
      category: disp.category,
      categoryId: disp.category_id,
      model: disp.model,
      isSubjective: disp.is_subjective,
      isObjective: disp.is_objective,
      subjectiveType: disp.subjective_type,
      objectiveOptions: disp.objective_options,
      agentIds: disp.agent_ids,
      alreadyImported: importedBolnaIds.has(disp.id),
    }));
  }
}
