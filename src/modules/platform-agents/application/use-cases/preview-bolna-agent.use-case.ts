import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import prisma from "../../../../shared/config/database/prisma";

export class PreviewBolnaAgentUseCase {
  constructor(private readonly templateProvider: BolnaTemplateProvider) {}

  async execute(bolnaId: string) {
    // Fetch agent blueprint
    const template = await this.templateProvider.fetchTemplate(bolnaId);

    // Fetch extraction categories + dispositions from Bolna
    let extractions: any[] = [];
    try {
      const categoryData = await this.templateProvider.listCategories(bolnaId);
      extractions = categoryData.categories ?? [];
    } catch {
      // Agent may have no extractions — that's fine
    }

    // Check what's already imported locally
    const existingAgent = await prisma.platformAgent.findUnique({
      where: { bolnaId },
      select: { id: true, slug: true },
    });

    const existingCategoryBolnaIds = new Set(
      (
        await prisma.extractionCategory.findMany({
          where: { bolnaId: { not: null } },
          select: { bolnaId: true },
        })
      ).map((c) => c.bolnaId),
    );

    const existingDispositionBolnaIds = new Set(
      (
        await prisma.extractionDisposition.findMany({
          where: { bolnaId: { not: null } },
          select: { bolnaId: true },
        })
      ).map((d) => d.bolnaId),
    );

    const enrichedExtractions = extractions.map((cat: any) => ({
      bolnaId: cat.id,
      name: cat.name,
      model: cat.model,
      alreadyImported: existingCategoryBolnaIds.has(cat.id),
      dispositions: (cat.dispositions ?? []).map((disp: any) => ({
        bolnaId: disp.id,
        name: disp.name,
        question: disp.question,
        isSubjective: disp.is_subjective,
        isObjective: disp.is_objective,
        alreadyImported: existingDispositionBolnaIds.has(disp.id),
      })),
    }));

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
