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
}