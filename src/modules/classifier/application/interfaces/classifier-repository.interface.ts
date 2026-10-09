import type {
  ClassifierDisposition,
  ClassifierCallResult,
  ClassifierExtractionStatus,
} from "@prisma/client";
import type {
  CreateClassifierDispositionDTO,
  UpdateClassifierDispositionDTO,
  ListClassifierDispositionsFilters,
} from "../dto/classifier.dto";

export interface ClassifierRepository {
  // ── Dispositions ────────────────────────────────────────────────
  createDisposition(
    data: CreateClassifierDispositionDTO,
  ): Promise<ClassifierDisposition>;

  updateDisposition(
    id: string,
    data: UpdateClassifierDispositionDTO,
  ): Promise<ClassifierDisposition>;

  deleteDisposition(id: string): Promise<void>;

  getDispositionById(id: string): Promise<ClassifierDisposition | null>;

  getDispositionBySlugAndIndustry(
    slug: string,
    industryPackId: string | null,
  ): Promise<ClassifierDisposition | null>;

  listDispositions(
    filters: ListClassifierDispositionsFilters,
  ): Promise<{ items: ClassifierDisposition[]; total: number }>;

  // ── Agent Links ─────────────────────────────────────────────────
  assignToAgent(
    platformAgentId: string,
    classifierDispositionIds: string[],
  ): Promise<void>;

  removeFromAgent(
    platformAgentId: string,
    classifierDispositionIds: string[],
  ): Promise<void>;

  listAgentClassifiers(
    platformAgentId: string,
  ): Promise<ClassifierDisposition[]>;

  // ── Industry-Aware Resolution ───────────────────────────────────
  resolveForAgent(
    platformAgentId: string,
    industryPackId: string | null,
  ): Promise<ClassifierDisposition[]>;

  // ── Call Results ────────────────────────────────────────────────
  createCallResult(data: {
    callId: string;
    tenantId: string;
    campaignId: string;
    batchId: string | null;
    dispositionCount: number;
    transcriptLength: number;
  }): Promise<ClassifierCallResult>;

  updateCallResult(
    callId: string,
    data: {
      status: ClassifierExtractionStatus;
      rawResponse?: unknown;
      results?: unknown;
      inputTokens?: number;
      outputTokens?: number;
      gatewayCost?: string;
      errorMessage?: string;
      processedAt?: Date;
      retryCount?: number;
    },
  ): Promise<void>;

  getCallResult(callId: string): Promise<ClassifierCallResult | null>;

  listCallResults(filters: {
    tenantId: string;
    campaignId?: string;
    batchId?: string;
    status?: ClassifierExtractionStatus;
    page: number;
    limit: number;
  }): Promise<{ items: ClassifierCallResult[]; total: number }>;

  // ── Call Transcript ─────────────────────────────────────────────
  getCallTranscript(callId: string): Promise<{
    transcript: string | null;
    tenantId: string;
    campaignId: string;
    batchId: string | null;
    platformAgentId: string | null;
    industryPackId: string | null;
  } | null>;
}
