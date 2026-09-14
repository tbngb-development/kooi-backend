import prisma from "../../../../shared/config/database/prisma";

export class GenerateDynamicExtractionsUseCase {
  async execute(
    callId: string,
    extractedData: Record<string, any> | null | undefined,
  ) {
    if (!extractedData || Object.keys(extractedData).length === 0) return null;

    // 1. Resolve the chain: Call → Campaign → Assistant → PlatformAgent → Extractions
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        tenantId: true,
        campaign: {
          select: {
            assistant: {
              select: {
                platformAgentId: true,
                platformAgent: {
                  select: {
                    id: true,
                    extractionCategories: {
                      select: {
                        id: true,
                        name: true,
                        bolnaId: true,
                        dispositions: {
                          select: {
                            id: true,
                            bolnaId: true,
                            slug: true,
                            name: true,
                            isSubjective: true,
                            isObjective: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!call) return null;

    const platformAgent = call.campaign?.assistant?.platformAgent;

    // 2. Store raw extraction result regardless of platform agent
    const rawExtractionResult = extractedData;

    // 3. If no platform agent or no extraction config, store raw only
    if (!platformAgent || platformAgent.extractionCategories.length === 0) {
      await prisma.callAnalysis.upsert({
        where: { callId },
        create: {
          callId,
          tenantId: call.tenantId,
          extractionResult: rawExtractionResult,
        },
        update: {
          extractionResult: rawExtractionResult,
        },
      });
      return rawExtractionResult;
    }

    // 4. Build disposition lookup map (by bolnaId, name, slug — all lowercase)
    const dispositionMap = new Map<string, any>();
    for (const category of platformAgent.extractionCategories) {
      for (const disp of category.dispositions) {
        if (disp.bolnaId) dispositionMap.set(disp.bolnaId, disp);
        dispositionMap.set(disp.name.toLowerCase(), disp);
        dispositionMap.set(disp.slug.toLowerCase(), disp);
      }
    }

    // 5. Map Bolna extracted_data to local disposition records
    // Bolna shape: { "Category Name": { "Disposition Name": { subjective, objective, confidence, ... } } }
    const dynamicResult: Record<string, any> = {};

    for (const [categoryName, dispositions] of Object.entries(extractedData)) {
      if (typeof dispositions !== "object" || dispositions === null) continue;

      const categoryResult: Record<string, any> = {};

      for (const [dispName, value] of Object.entries(
        dispositions as Record<string, any>,
      )) {
        if (typeof value !== "object" || value === null) continue;

        const localDisp =
          dispositionMap.get(dispName.toLowerCase()) ??
          dispositionMap.get(dispName);

        categoryResult[dispName] = {
          localDispositionId: localDisp?.id ?? null,
          localDispositionSlug: localDisp?.slug ?? null,
          isSubjective: localDisp?.isSubjective ?? null,
          isObjective: localDisp?.isObjective ?? null,
          subjective: value.subjective ?? null,
          objective: value.objective ?? null,
          confidence: value.confidence ?? null,
          confidenceLabel: value.confidence_label ?? null,
          reasoning: {
            subjective: value.reasoning_subjective ?? null,
            objective: value.reasoning_objective ?? null,
          },
          validation: value.validation ?? null,
        };
      }

      dynamicResult[categoryName] = categoryResult;
    }

    // 6. Upsert CallAnalysis with both raw and mapped results
    await prisma.callAnalysis.upsert({
      where: { callId },
      create: {
        callId,
        tenantId: call.tenantId,
        extractionResult: rawExtractionResult,
        dynamicExtractions: dynamicResult,
      },
      update: {
        extractionResult: rawExtractionResult,
        dynamicExtractions: dynamicResult,
      },
    });

    return dynamicResult;
  }
}
