import type { CallExtractionRepository } from "../interfaces/call-extraction-repository.interface";
import {
  buildDispositionLookupMap,
  mapDynamicExtractions,
  extractOverviewEntries,
  extractInsightEntries,
  type DynamicExtractionMap,
} from "../../domain/rules/dynamic-extraction-mapper.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface MaterializeCallExtractionsInput {
  callId: string;
  tenantId: string;
  extractedData?: Record<string, unknown> | null;
}

export interface MaterializeCallExtractionsResult {
  dynamicResult: DynamicExtractionMap | null;
  overviewCount: number;
  insightCount: number;
}

/**
 * Specialized use case responsible for parsing, structuring, and materializing
 * call extractions, objective overviews, and subjective insights.
 * Can be invoked from telephony webhooks or tested/re-executed independently.
 */
export class MaterializeCallExtractionsUseCase {
  constructor(
    private readonly extractionRepo: CallExtractionRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(
    input: MaterializeCallExtractionsInput,
  ): Promise<MaterializeCallExtractionsResult | null> {
    const { callId, tenantId, extractedData } = input;

    if (!extractedData || Object.keys(extractedData).length === 0) {
      return null;
    }

    const agentMap = await this.extractionRepo.getAgentDispositionsForCall(callId);

    // Fallback: If no platform agent is linked or no dispositions are assigned,
    // persist raw extraction result only without dynamic projection.
    if (!agentMap.platformAgentId || agentMap.dispositions.length === 0) {
      await this.extractionRepo.upsertCallAnalysis({
        callId,
        tenantId,
        extractionResult: extractedData,
      });
      return null;
    }

    const lookupMap = buildDispositionLookupMap(agentMap.dispositions);
    const { dynamicResult } = mapDynamicExtractions(extractedData, lookupMap);

    await this.extractionRepo.upsertCallAnalysis({
      callId,
      tenantId,
      extractionResult: extractedData,
      dynamicExtractions: dynamicResult,
    });

    const callContext = await this.extractionRepo.getCallContext(callId);
    let overviewCount = 0;
    let insightCount = 0;

    if (callContext) {
      // 1. Materialize Objective Overview
      const objectiveEntries = extractOverviewEntries(dynamicResult);
      if (objectiveEntries.length > 0) {
        const uniqueDispositionIds = [
          ...new Set(objectiveEntries.map((e) => e.dispositionId)),
        ];
        const nameMap = await this.extractionRepo.getDispositionDisplayNames(
          uniqueDispositionIds,
        );

        const overviewItems = objectiveEntries.map((e) => ({
          dispositionId: e.dispositionId,
          dispositionSlug: e.dispositionSlug,
          dispositionName: nameMap.get(e.dispositionId) ?? e.dispositionSlug,
          categoryName: e.categoryName,
          objectiveValue: e.objectiveValue,
          confidence: e.confidence,
          sortOrder: e.sortOrder,
        }));

        await this.extractionRepo.replaceExtractionOverview({
          callId,
          tenantId,
          campaignId: callContext.campaignId,
          batchId: callContext.batchId,
          items: overviewItems,
        });

        overviewCount = overviewItems.length;
        this.logger?.debug("Extraction overview materialized", {
          action: "extractions.overview_materialized",
          callId,
          tenantId,
          rowCount: overviewCount,
        });
      }

      // 2. Materialize Subjective Insights
      const subjectiveEntries = extractInsightEntries(dynamicResult);
      if (subjectiveEntries.length > 0) {
        const uniqueDispositionIds = [
          ...new Set(subjectiveEntries.map((e) => e.dispositionId)),
        ];
        const nameMap = await this.extractionRepo.getDispositionDisplayNames(
          uniqueDispositionIds,
        );

        const insightItems = subjectiveEntries.map((e) => ({
          dispositionId: e.dispositionId,
          dispositionSlug: e.dispositionSlug,
          dispositionName: nameMap.get(e.dispositionId) ?? e.dispositionSlug,
          categoryName: e.categoryName,
          subjectiveValue: e.subjectiveValue,
          normalizedValue: e.normalizedValue,
          confidence: e.confidence,
        }));

        await this.extractionRepo.replaceExtractionInsights({
          callId,
          tenantId,
          campaignId: callContext.campaignId,
          batchId: callContext.batchId,
          items: insightItems,
        });

        insightCount = insightItems.length;
        this.logger?.debug("Extraction insights materialized", {
          action: "extractions.insights_materialized",
          callId,
          tenantId,
          rowCount: insightCount,
        });
      }
    }

    return {
      dynamicResult,
      overviewCount,
      insightCount,
    };
  }
}
