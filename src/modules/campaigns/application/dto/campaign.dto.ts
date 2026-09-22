export interface CreateCampaignInput {
  name: string;
  description?: string;
  assistantId: string;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown>;
}

export interface ExtractVariablesInput {
  assistantId: string;
  filePath: string;
  originalFileName: string;
}

export interface ExtractVariablesOutput {
  variables: Record<string, string | null>;
  confidence: number;
  warnings: string[];
  pdfMeta: {
    fileName: string;
    pageCount: number;
    textLength: number;
    truncated: boolean;
  };
}

export interface ParseLeadsInput {
  tenantId: string;
  campaignId: string;
  fileBuffer: Buffer;
  fileName: string;
}

export interface ParseLeadsOutput {
  total: number;
  valid: number;
  invalid: number;
  nonIndian: number;
  nonIndianNumbers: string[];
  inFileDuplicates: number;
  inFileDuplicateNumbers: string[];
  dbDuplicates: number;
  dbDuplicateNumbers: string[];
  readyToImport: number;
  detectedHeaders: {
    contact_number: boolean;
    customer_name: boolean;
  };
  // ── Financial Estimations (Paisa) ──────────────────────────────────
  estimation: {
    estimatedCostMinPaisa: number;
    estimatedCostMaxPaisa: number;
    currentBalancePaisa: number;
    perMinuteRatePaisa: number;
    assumptions: {
      historicalAnswerRate: number; // e.g. 0.40
      retryCount: number; // e.g. 1
      durationMinSec: number; // e.g. 45
      durationMaxSec: number; // e.g. 90
    };
  };
}

// ── V2 Performance (Dynamic Extraction Metrics) ─────────────────────

export interface PerformanceV2MetricBreakdown {
  key: string;
  label: string;
  totalEvaluated: number;
  matched: number;
  matchRate: number;
  actualValue: string;
  matchValue: string;
  actualValueBreakdown: Record<string, number>;
}

export interface CampaignPerformanceV2Result {
  metrics: PerformanceV2MetricBreakdown[];
}

// ── Extraction Overview ──

export interface ExtractionOverviewInput {
  tenantId: string;
  campaignId: string;
  batchId?: string;
}

export interface ExtractionOverviewDisposition {
  dispositionId: string;
  dispositionSlug: string;
  dispositionName: string;
  categoryName: string;
  values: Array<{
    value: string;
    count: number;
    percentage: number;
  }>;
  totalCount: number;
}

export interface ExtractionOverviewResult {
  campaignId: string;
  totalCalls: number;
  dispositions: ExtractionOverviewDisposition[];
}

// ── Extraction Insights (Subjective) ──

export interface ExtractionInsightInput {
  tenantId: string;
  campaignId: string;
  batchId?: string;
  topN?: number;
}

export interface ExtractionInsightValue {
  value: string;
  displayValue: string;
  count: number;
  percentage: number;
}

export interface ExtractionInsightDisposition {
  dispositionId: string;
  dispositionSlug: string;
  dispositionName: string;
  categoryName: string;
  uniqueValues: number;
  totalCount: number;
  topValues: ExtractionInsightValue[];
}

export interface ExtractionInsightResult {
  campaignId: string;
  totalCalls: number;
  insights: ExtractionInsightDisposition[];
}
