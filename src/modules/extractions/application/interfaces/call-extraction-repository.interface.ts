import type { AgentDispositionLookupItem } from "../../domain/rules/dynamic-extraction-mapper.rules";

export interface CallExtractionContext {
  campaignId: string | null;
  batchId: string | null;
}

export interface OverviewPersistenceItem {
  dispositionId: string;
  dispositionSlug: string;
  dispositionName: string;
  categoryName: string;
  objectiveValue: string;
  confidence: number | null;
  sortOrder: number;
}

export interface InsightPersistenceItem {
  dispositionId: string;
  dispositionSlug: string;
  dispositionName: string;
  categoryName: string;
  subjectiveValue: string;
  normalizedValue: string;
  confidence: number | null;
}

export interface CallExtractionRepository {
  getAgentDispositionsForCall(
    callId: string,
  ): Promise<{ platformAgentId: string | null; dispositions: AgentDispositionLookupItem[] }>;

  getCallContext(callId: string): Promise<CallExtractionContext | null>;

  upsertCallAnalysis(params: {
    callId: string;
    tenantId: string;
    extractionResult: unknown;
    dynamicExtractions?: unknown;
  }): Promise<void>;

  getDispositionDisplayNames(dispositionIds: string[]): Promise<Map<string, string>>;

  replaceExtractionOverview(params: {
    callId: string;
    tenantId: string;
    campaignId: string | null;
    batchId: string | null;
    items: OverviewPersistenceItem[];
  }): Promise<void>;

  replaceExtractionInsights(params: {
    callId: string;
    tenantId: string;
    campaignId: string | null;
    batchId: string | null;
    items: InsightPersistenceItem[];
  }): Promise<void>;
}
