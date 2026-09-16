import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import prisma from "../../../../shared/config/database/prisma";

export class PreviewBolnaAgentUseCase {
  constructor(private readonly templateProvider: BolnaTemplateProvider) {}

  async execute(bolnaId: string) {
    // 1. Fetch agent blueprint from Bolna
    const template = await this.templateProvider.fetchTemplate(bolnaId);

    // 2. Fetch extraction categories + dispositions from Bolna
    let extractions: any[] = [];
    try {
      const categoryData = await this.templateProvider.listCategories(bolnaId);
      extractions = categoryData?.categories ?? [];
    } catch {
      // Agent may have no extractions on Bolna — that's fine
    }

    // 3. Check if platform agent is already registered locally
    const existingAgent = await prisma.platformAgent.findUnique({
      where: { bolnaId },
      select: { id: true, slug: true },
    });

    // 4. Load local catalog names to detect duplicates
    const [localCategories, localDispositions] = await Promise.all([
      prisma.extractionCategory.findMany({ select: { name: true } }),
      prisma.extractionDisposition.findMany({ select: { name: true } }),
    ]);

    const localCategoryNames = new Set(
      localCategories.map((c) => c.name.toLowerCase()),
    );
    const localDispositionNames = new Set(
      localDispositions.map((d) => d.name.toLowerCase()),
    );

    // 5. Check existing Bolna bindings for this agent if registered
    let boundDispositionBolnaIds = new Set<string>();
    if (existingAgent) {
      const bindings = await prisma.agentBolnaExtractionBinding.findMany({
        where: { platformAgentId: existingAgent.id },
        select: { bolnaDispositionId: true },
      });
      boundDispositionBolnaIds = new Set(
        bindings.map((b) => b.bolnaDispositionId),
      );
    }

    // 6. Enrich extraction tree with catalog and binding status
    const enrichedExtractions = extractions.map((cat: any) => {
      const categoryExists = localCategoryNames.has(cat.name.toLowerCase());

      return {
        bolnaId: cat.id,
        name: cat.name,
        model: cat.model,
        alreadyImported: categoryExists,
        dispositions: (cat.dispositions ?? []).map((disp: any) => {
          const dispositionExists = localDispositionNames.has(
            disp.name.toLowerCase(),
          );
          const isBound = boundDispositionBolnaIds.has(disp.id);

          return {
            bolnaId: disp.id,
            name: disp.name,
            question: disp.question,
            isSubjective: disp.is_subjective,
            isObjective: disp.is_objective,
            alreadyImported: dispositionExists,
            isBoundToAgent: isBound,
          };
        }),
      };
    });

    return {
      agent: {
        bolnaId: template.bolnaId,
        agentName: template.agentName,
        systemPrompt: template.systemPrompt,
        defaultConfig: template.defaultConfig,
        alreadyImported: !!existingAgent,
        kooiPlatformAgentId: existingAgent?.id ?? null,
      },
      extractions: enrichedExtractions,
      extractionSummary: {
        totalCategories: enrichedExtractions.length,
        totalDispositions: enrichedExtractions.reduce(
          (sum: number, cat: any) => sum + cat.dispositions.length,
          0,
        ),
        newCategories: enrichedExtractions.filter(
          (c: any) => !c.alreadyImported,
        ).length,
        newDispositions: enrichedExtractions.reduce(
          (sum: number, cat: any) =>
            sum +
            cat.dispositions.filter((d: any) => !d.alreadyImported).length,
          0,
        ),
      },
    };
  }
}
