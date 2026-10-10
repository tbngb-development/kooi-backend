export interface TestAgentExtractionInput {
  platformAgentId: string;
  callId?: string;
  customTranscript?: string;
  dispositionIds?: string[];
  provider?: "gemini" | "openai";
  model?: string;
  apiKey?: string;
}

export interface TestExtractionDispositionResult {
  subjective: string | null;
  objective: string | null;
  confidence: number;
  confidence_label: "High" | "Medium" | "Low";
  reasoning_subjective: string | null;
  reasoning_objective: string | null;
  validation: string | null;
}

export interface TestAgentExtractionOutput {
  callId: string | null;
  callInfo?: {
    leadPhone?: string;
    leadName?: string | null;
    campaignName?: string;
    tenantName?: string;
    duration?: number | null;
  };
  transcript: string;
  extracted_data: Record<
    string,
    Record<string, TestExtractionDispositionResult>
  >;
  usage: {
    provider: "gemini" | "openai";
    model: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    categoriesEvaluated: number;
    dispositionsEvaluated: number;
  };
}

export interface TestCallCandidate {
  id: string;
  leadPhone: string;
  leadName?: string | null;
  campaignName: string;
  tenantName: string;
  duration: number | null;
  endedAt: string | null;
  transcriptSnippet: string;
  transcriptLength: number;
  isFromThisAgent: boolean;
}
