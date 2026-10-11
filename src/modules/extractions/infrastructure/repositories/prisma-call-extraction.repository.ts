import prisma from "../../../../shared/config/database/prisma";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import type {
  CallExtractionRepository,
  CallExtractionContext,
  OverviewPersistenceItem,
  InsightPersistenceItem,
} from "../../application/interfaces/call-extraction-repository.interface";
import type { AgentDispositionLookupItem } from "../../domain/rules/dynamic-extraction-mapper.rules";

export class PrismaCallExtractionRepository implements CallExtractionRepository {
  async getAgentDispositionsForCall(
    callId: string,
  ): Promise<{ platformAgentId: string | null; dispositions: AgentDispositionLookupItem[] }> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        campaign: {
          select: {
            assistant: {
              select: {
                platformAgent: {
                  select: {
                    id: true,
                    categories: {
                      select: {
                        category: {
                          select: {
                            dispositions: {
                              select: {
                                disposition: {
                                  select: {
                                    id: true,
                                    name: true,
                                    displayName: true,
                                    slug: true,
                                    isObjective: true,
                                    isSubjective: true,
                                    objectiveOptions: true,
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
            },
          },
        },
      },
    });

    const platformAgent = call?.campaign?.assistant?.platformAgent;
    if (!platformAgent) {
      return { platformAgentId: null, dispositions: [] };
    }

    const dispositionMap = new Map<string, AgentDispositionLookupItem>();
    for (const catRel of platformAgent.categories) {
      for (const dispRel of catRel.category.dispositions) {
        dispositionMap.set(dispRel.disposition.id, {
          ...dispRel.disposition,
          objectiveOptions: (dispRel.disposition.objectiveOptions as any) ?? null,
        });
      }
    }

    return {
      platformAgentId: platformAgent.id,
      dispositions: Array.from(dispositionMap.values()),
    };
  }

  async getCallContext(callId: string): Promise<CallExtractionContext | null> {
    return prisma.call.findUnique({
      where: { id: callId },
      select: { campaignId: true, batchId: true },
    });
  }

  async upsertCallAnalysis(params: {
    callId: string;
    tenantId: string;
    extractionResult: unknown;
    dynamicExtractions?: unknown;
  }): Promise<void> {
    const { callId, tenantId, extractionResult, dynamicExtractions } = params;
    await prisma.callAnalysis.upsert({
      where: { callId },
      create: {
        callId,
        tenantId,
        extractionResult: extractionResult as InputJsonValue,
        ...(dynamicExtractions !== undefined && {
          dynamicExtractions: dynamicExtractions as InputJsonValue,
        }),
      },
      update: {
        extractionResult: extractionResult as InputJsonValue,
        ...(dynamicExtractions !== undefined && {
          dynamicExtractions: dynamicExtractions as InputJsonValue,
        }),
      },
    });
  }

  async getDispositionDisplayNames(dispositionIds: string[]): Promise<Map<string, string>> {
    const dispositions = await prisma.extractionDisposition.findMany({
      where: { id: { in: dispositionIds } },
      select: { id: true, displayName: true },
    });
    return new Map(dispositions.map((d) => [d.id, d.displayName]));
  }

  async replaceExtractionOverview(params: {
    callId: string;
    tenantId: string;
    campaignId: string;
    batchId: string | null;
    items: OverviewPersistenceItem[];
  }): Promise<void> {
    const { callId, tenantId, campaignId, batchId, items } = params;

    await prisma.$transaction(async (tx) => {
      await tx.callExtractionOverview.deleteMany({ where: { callId } });

      if (items.length > 0) {
        await tx.callExtractionOverview.createMany({
          data: items.map((e) => ({
            callId,
            tenantId,
            campaignId,
            batchId,
            dispositionId: e.dispositionId,
            dispositionSlug: e.dispositionSlug,
            dispositionName: e.dispositionName,
            categoryName: e.categoryName,
            objectiveValue: e.objectiveValue,
            confidence: e.confidence,
            sortOrder: e.sortOrder,
          })),
        });
      }
    });
  }

  async replaceExtractionInsights(params: {
    callId: string;
    tenantId: string;
    campaignId: string;
    batchId: string | null;
    items: InsightPersistenceItem[];
  }): Promise<void> {
    const { callId, tenantId, campaignId, batchId, items } = params;

    await prisma.$transaction(async (tx) => {
      await tx.callExtractionInsight.deleteMany({ where: { callId } });

      if (items.length > 0) {
        await tx.callExtractionInsight.createMany({
          data: items.map((e) => ({
            callId,
            tenantId,
            campaignId,
            batchId,
            dispositionId: e.dispositionId,
            dispositionSlug: e.dispositionSlug,
            dispositionName: e.dispositionName,
            categoryName: e.categoryName,
            subjectiveValue: e.subjectiveValue,
            normalizedValue: e.normalizedValue,
            confidence: e.confidence,
          })),
        });
      }
    });
  }
}
