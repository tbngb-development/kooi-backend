import type { ClassifierQuestionType } from "@prisma/client";

// ── Disposition CRUD ────────────────────────────────────────────────────────

export interface ObjectiveOption {
  value: string;
  condition: string;
}

export interface CreateClassifierDispositionDTO {
  slug: string;
  name: string;
  displayName: string;
  question: string;
  questionType: ClassifierQuestionType;
  objectiveOptions: ObjectiveOption[];
  industryPackId?: string | null;
  isMetric?: boolean;
}

export interface UpdateClassifierDispositionDTO {
  name?: string;
  displayName?: string;
  question?: string;
  questionType?: ClassifierQuestionType;
  objectiveOptions?: ObjectiveOption[];
  industryPackId?: string | null;
  isActive?: boolean;
  isMetric?: boolean;
}

export interface ListClassifierDispositionsFilters {
  industryPackId?: string;
  questionType?: ClassifierQuestionType;
  isActive?: boolean;
  isMetric?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CallMetricPersistenceItem {
  classifierDispositionId: string;
  classifierSlug: string;
  classifierName: string;
  metricValue: string;
  confidence?: number | null;
}

// ── Agent Assignment ────────────────────────────────────────────────────────

export interface AssignClassifierToAgentDTO {
  classifierDispositionIds: string[];
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export interface ClassifierEvaluationParams {
  state: string;
  questions: Record<string, JevQuestionDef>;
}

export type JevQuestionDef =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

export interface ClassifierEvaluationResult {
  answers: Record<string, ClassifierAnswerResult>;
  inputTokens: number;
  outputTokens: number;
  gatewayCost: string | null;
  rawResponse: Record<string, unknown>;
}

export interface ClassifierAnswerResult {
  value: string | string[] | null;
  confidence: number | Record<string, number> | null;
  questionType: ClassifierQuestionType;
  classifierDispositionId: string;
}

// ── Test API ────────────────────────────────────────────────────────────────

export interface TestClassifierDTO {
  classifierDispositionIds: string[];
  transcriptSource: "existing" | "custom";
  callId?: string;
  customTranscript?: string;
}

export interface TestClassifierResult {
  results: Record<string, ClassifierAnswerResult>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    gatewayCost: string | null;
  };
}

// ── Call Results ────────────────────────────────────────────────────────────

export interface ClassifierResultFilters {
  tenantId?: string;
  campaignId?: string;
  batchId?: string;
  status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";
  page?: number;
  limit?: number;
}

// ── Queue Job ───────────────────────────────────────────────────────────────

export interface ClassifierJobData {
  callId: string;
  tenantId: string;
}
