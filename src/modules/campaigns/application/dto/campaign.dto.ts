export interface CreateCampaignInput {
  name: string;
  description?: string;
  assistantId: string;
  brochureId?: string;
  variables?: Record<string, string>;
  defaultRetryConfig?: Record<string, unknown>;
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
