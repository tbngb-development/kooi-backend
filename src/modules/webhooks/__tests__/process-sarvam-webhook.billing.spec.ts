import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessSarvamWebhookUseCase } from "../application/use-cases/process-sarvam-webhook.use-case";
import type { SarvamLeadCorrelationService } from "../application/services/sarvam-lead-correlation.service";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
  SarvamAttemptHistoryEntry,
} from "../application/interfaces/sarvam-webhook-repository.interface";
import type { SarvamWebhookAttemptPayload } from "../application/dto/sarvam-webhook.dto";
import type { DebitWalletForCallUseCase, DebitCallResult } from "../../wallet/application/use-cases/debit-wallet.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";

describe("Phase 6: Sarvam Call Billing Integration", () => {
  let useCase: ProcessSarvamWebhookUseCase;
  let mockCorrelationService: SarvamLeadCorrelationService;
  let mockRepo: ISarvamWebhookRepository;
  let mockDebitUseCase: DebitWalletForCallUseCase;
  let mockLogger: Logger;

  const tenantId = "tenant-sarvam-billing-1";
  const campaignId = "camp-sarvam-billing-101";
  const batchId = "batch-sarvam-billing-202";
  const leadId = "lead-sarvam-billing-303";
  const callId = "call-kooi-aggregate-1";
  const sarvamCampaignId = "sarvam-camp-ext-1";
  const sarvamCohortId = "sarvam-cohort-ext-2";
  const sarvamAgentId = "agent-sarvam-app-1";
  const userPhoneNumber = "+919876543210";
  const userIdentifier = "usr-ref-999";
  const testSecret = "test-sarvam-secret-xyz";
  const sarvamCostPerMinutePaisa = 120; // ₹1.20/min platform base cost

  const defaultCorrelationSuccess = {
    success: true as const,
    data: {
      tenantId,
      campaign: {
        id: campaignId,
        name: "Q1 Sarvam Campaign",
        provider: "SARVAM" as const,
        sarvamCampaignId,
        sarvamAgentId,
        status: "RUNNING" as const,
      },
      batch: {
        id: batchId,
        name: "Batch 1",
        provider: "SARVAM" as const,
        sarvamCohortId,
        status: "RUNNING" as const,
      },
      lead: {
        id: leadId,
        phone: userPhoneNumber,
        name: "Rohan Gupta",
        status: "CALLING" as const,
        metadata: {},
      },
      normalizedPhone: userPhoneNumber,
    },
  };

  const createAttemptPayload = (
    attemptId: string,
    connectivity: "connected" | "no_answer" | "busy" | "failed",
    duration: number,
    retryAttempt = 0,
    nextAction: string | null = null,
  ): SarvamWebhookAttemptPayload => ({
    app_id: sarvamAgentId,
    app_version: 1,
    attempt_id: attemptId,
    campaign_id: sarvamCampaignId,
    cohort_id: sarvamCohortId,
    completion_status: connectivity === "connected" ? "completed" : "failed",
    connectivity_status: connectivity,
    next_action_status: nextAction,
    failure_reason: connectivity === "connected" ? null : "User unreachable",
    user_identifier: userIdentifier,
    user_phone_number: userPhoneNumber,
    agent_phone_number: "+918041234567",
    duration,
    interaction_id: connectivity === "connected" ? `inter-${attemptId}` : null,
    retry_attempt: retryAttempt,
    executed_at: "2026-04-01T10:00:00Z",
    start_datetime: "2026-04-01T10:00:05Z",
    end_datetime: "2026-04-01T10:00:50Z",
    interaction_transcript: [
      { role: "agent", en_text: "Hello, this is Sarvam agent." },
      { role: "user", en_text: "Hello." },
    ],
    metadata: {
      tenantId,
      campaignId,
      secret: testSecret,
    },
  });

  let inMemoryCall: AggregateCallCandidate | null = null;
  let inMemoryLeadStatus = "CALLING";

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryCall = null;
    inMemoryLeadStatus = "CALLING";

    mockCorrelationService = {
      correlate: vi.fn().mockResolvedValue(defaultCorrelationSuccess),
    } as unknown as SarvamLeadCorrelationService;

    mockRepo = {
      executeInAdvisoryLock: vi.fn().mockImplementation(async (_key, op) => op(mockRepo)),
      findAggregateCall: vi.fn().mockImplementation(async () => inMemoryCall),
      createAggregateCall: vi.fn().mockImplementation(async (data) => {
        inMemoryCall = {
          id: callId,
          tenantId: data.tenantId,
          campaignId: data.campaignId,
          batchId: data.batchId,
          leadId: data.leadId,
          provider: data.provider,
          status: data.status,
          sarvamAttemptId: data.sarvamAttemptId,
          sarvamInteractionId: data.sarvamInteractionId ?? null,
          sarvamUserIdentifier: data.sarvamUserIdentifier,
          duration: data.duration ?? null,
          recording: null,
          transcript: data.transcript ?? null,
          transcriptMessages: data.transcriptMessages ?? null,
          callHistory: data.callHistory,
          extractionResult: data.extractionResult ?? null,
          startedAt: data.startedAt ?? null,
          endedAt: data.endedAt ?? null,
          agentNumber: data.agentNumber ?? null,
          chargedAmount: data.chargedAmount ?? null,
          billableSeconds: data.billableSeconds ?? null,
          platformCost: data.platformCost ?? null,
          planVersionId: data.planVersionId ?? null,
          appliedRate: data.appliedRate ?? null,
          appliedMinSec: data.appliedMinSec ?? null,
          appliedIncrementSec: data.appliedIncrementSec ?? null,
        };
        return inMemoryCall;
      }),
      updateAggregateCall: vi.fn().mockImplementation(async (_id, data) => {
        if (!inMemoryCall) return;
        inMemoryCall = {
          ...inMemoryCall,
          status: data.status,
          sarvamAttemptId: data.sarvamAttemptId,
          sarvamInteractionId: data.sarvamInteractionId ?? inMemoryCall.sarvamInteractionId,
          sarvamUserIdentifier: data.sarvamUserIdentifier,
          callHistory: data.callHistory,
          duration: data.duration ?? inMemoryCall.duration,
          startedAt: data.startedAt ?? inMemoryCall.startedAt,
          endedAt: data.endedAt ?? inMemoryCall.endedAt,
          transcript: data.transcript ?? inMemoryCall.transcript,
          transcriptMessages: data.transcriptMessages ?? inMemoryCall.transcriptMessages,
          extractionResult: data.extractionResult ?? inMemoryCall.extractionResult,
          agentNumber: data.agentNumber ?? inMemoryCall.agentNumber,
          chargedAmount: data.chargedAmount !== undefined ? data.chargedAmount : inMemoryCall.chargedAmount,
          billableSeconds: data.billableSeconds !== undefined ? data.billableSeconds : inMemoryCall.billableSeconds,
          platformCost: data.platformCost !== undefined ? data.platformCost : inMemoryCall.platformCost,
          planVersionId: data.planVersionId ?? inMemoryCall.planVersionId,
          appliedRate: data.appliedRate ?? inMemoryCall.appliedRate,
          appliedMinSec: data.appliedMinSec ?? inMemoryCall.appliedMinSec,
          appliedIncrementSec: data.appliedIncrementSec ?? inMemoryCall.appliedIncrementSec,
        };
      }),
      updateLeadStatus: vi.fn().mockImplementation(async (_leadId, status) => {
        inMemoryLeadStatus = status;
      }),
      findSarvamAgentForTenant: vi.fn().mockResolvedValue(null),
      getCallAnalysis: vi.fn().mockResolvedValue(null),
      upsertCallAnalysisOutputVariables: vi.fn().mockResolvedValue(undefined),
      findCampaignGoals: vi.fn().mockResolvedValue([]),
      upsertCallGoalResults: vi.fn().mockResolvedValue(undefined),
      markCallGoalPassed: vi.fn().mockResolvedValue(undefined),
    } as unknown as ISarvamWebhookRepository;

    mockDebitUseCase = {
      execute: vi.fn().mockResolvedValue({
        amountPaisa: 150,
        billableSeconds: 60,
        planVersionId: "plan-version-enterprise-1",
        appliedRate: 150, // ₹1.50/min
        appliedMinSec: 30,
        appliedIncrementSec: 15,
      } as DebitCallResult),
    } as unknown as DebitWalletForCallUseCase;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    useCase = new ProcessSarvamWebhookUseCase(
      mockCorrelationService,
      mockRepo,
      mockLogger,
      testSecret,
      undefined, // queue
      mockDebitUseCase,
      sarvamCostPerMinutePaisa,
    );
  });

  describe("1. Successful Connected Attempt Billing", () => {
    it("debits wallet using attempt-scoped idempotency key and updates Call with financial snapshot", async () => {
      const payload = createAttemptPayload("attempt-001", "connected", 45);

      const result = await useCase.execute(payload);

      expect(result.status).toBe("SUCCESS");
      expect(mockDebitUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockDebitUseCase.execute).toHaveBeenCalledWith({
        tenantId,
        callId,
        callAttemptId: "attempt-001",
        durationSec: 45,
      });

      // Verify Call record has accumulated billing and plan snapshot
      expect(inMemoryCall?.chargedAmount).toBe(150);
      expect(inMemoryCall?.billableSeconds).toBe(60);
      expect(inMemoryCall?.appliedRate).toBe(150);
      expect(inMemoryCall?.appliedMinSec).toBe(30);
      expect(inMemoryCall?.appliedIncrementSec).toBe(15);
      expect(inMemoryCall?.planVersionId).toBe("plan-version-enterprise-1");

      // Platform cost = ceil((60 / 60) * 120) = 120 paisa
      expect(inMemoryCall?.platformCost).toBe(120);

      // Verify attempt history entry records individual attempt breakdown
      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history).toHaveLength(1);
      expect(history[0].chargedAmount).toBe(150);
      expect(history[0].billableSeconds).toBe(60);
      expect(history[0].platformCost).toBe(120);
    });

    it("leaves platformCost as null when sarvamCostPerMinutePaisa is not configured (0)", async () => {
      const zeroCostUseCase = new ProcessSarvamWebhookUseCase(
        mockCorrelationService,
        mockRepo,
        mockLogger,
        testSecret,
        undefined,
        mockDebitUseCase,
        0, // No platform cost configured
      );

      const payload = createAttemptPayload("attempt-001", "connected", 45);
      await zeroCostUseCase.execute(payload);

      expect(inMemoryCall?.chargedAmount).toBe(150);
      expect(inMemoryCall?.platformCost).toBeNull();
      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history[0].platformCost).toBeNull();
    });
  });

  describe("2. Unanswered, Busy, and Failed Attempts (Zero Charge)", () => {
    it("does not debit wallet when connectivity is no_answer", async () => {
      const payload = createAttemptPayload("attempt-001", "no_answer", 0, 0, "retry");

      const result = await useCase.execute(payload);

      expect(result.status).toBe("SUCCESS");
      expect(mockDebitUseCase.execute).not.toHaveBeenCalled();

      expect(inMemoryCall?.chargedAmount).toBeNull();
      expect(inMemoryCall?.billableSeconds).toBeNull();

      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history[0].chargedAmount).toBe(0);
      expect(history[0].billableSeconds).toBe(0);
      expect(history[0].platformCost).toBeNull();
    });

    it("does not debit wallet when connectivity is busy", async () => {
      const payload = createAttemptPayload("attempt-001", "busy", 0);

      await useCase.execute(payload);

      expect(mockDebitUseCase.execute).not.toHaveBeenCalled();
      expect(inMemoryCall?.chargedAmount).toBeNull();
    });

    it("does not debit wallet when call failed", async () => {
      const payload = createAttemptPayload("attempt-001", "failed", 0);

      await useCase.execute(payload);

      expect(mockDebitUseCase.execute).not.toHaveBeenCalled();
      expect(inMemoryCall?.chargedAmount).toBeNull();
    });
  });

  describe("3. Multiple Retries & Attempts for One Lead", () => {
    it("charges only the connected attempt when initial attempt was unanswered", async () => {
      // Attempt 0: Unanswered
      const attempt0 = createAttemptPayload("attempt-001", "no_answer", 0, 0, "retry");
      await useCase.execute(attempt0);

      expect(mockDebitUseCase.execute).not.toHaveBeenCalled();
      expect(inMemoryCall?.callHistory).toHaveLength(1);

      // Attempt 1: Connected (retried)
      const attempt1 = createAttemptPayload("attempt-002", "connected", 50, 1, null);
      await useCase.execute(attempt1);

      expect(mockDebitUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockDebitUseCase.execute).toHaveBeenCalledWith({
        tenantId,
        callId,
        callAttemptId: "attempt-002",
        durationSec: 50,
      });

      expect(inMemoryCall?.chargedAmount).toBe(150);
      expect(inMemoryCall?.billableSeconds).toBe(60);

      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history).toHaveLength(2);
      expect(history[0].chargedAmount).toBe(0);
      expect(history[1].chargedAmount).toBe(150);
    });

    it("accumulates charges and billable duration when multiple attempts connect", async () => {
      vi.mocked(mockDebitUseCase.execute)
        .mockResolvedValueOnce({
          amountPaisa: 100,
          billableSeconds: 30,
          planVersionId: "plan-version-enterprise-1",
          appliedRate: 150,
          appliedMinSec: 30,
          appliedIncrementSec: 15,
        })
        .mockResolvedValueOnce({
          amountPaisa: 150,
          billableSeconds: 60,
          planVersionId: "plan-version-enterprise-1",
          appliedRate: 150,
          appliedMinSec: 30,
          appliedIncrementSec: 15,
        });

      // Attempt 0 connects for 25s
      const attempt0 = createAttemptPayload("attempt-001", "connected", 25, 0, "retry");
      await useCase.execute(attempt0);

      expect(inMemoryCall?.chargedAmount).toBe(100);
      expect(inMemoryCall?.billableSeconds).toBe(30);

      // Attempt 1 connects for 45s
      const attempt1 = createAttemptPayload("attempt-002", "connected", 45, 1, null);
      await useCase.execute(attempt1);

      expect(mockDebitUseCase.execute).toHaveBeenCalledTimes(2);
      // Total charges accumulated on Call: 100 + 150 = 250 paisa
      expect(inMemoryCall?.chargedAmount).toBe(250);
      // Total billable seconds accumulated on Call: 30 + 60 = 90 sec
      expect(inMemoryCall?.billableSeconds).toBe(90);

      // Platform cost accumulated: 60 paisa (30s) + 120 paisa (60s) = 180 paisa
      expect(inMemoryCall?.platformCost).toBe(180);

      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history).toHaveLength(2);
      expect(history[0].chargedAmount).toBe(100);
      expect(history[1].chargedAmount).toBe(150);
    });
  });

  describe("4. Duplicate Webhook Idempotency", () => {
    it("ignores duplicate delivery without triggering secondary wallet debit", async () => {
      const payload = createAttemptPayload("attempt-001", "connected", 45);

      // 1st delivery
      const res1 = await useCase.execute(payload);
      expect(res1.status).toBe("SUCCESS");
      expect(mockDebitUseCase.execute).toHaveBeenCalledTimes(1);
      expect(inMemoryCall?.chargedAmount).toBe(150);

      // 2nd delivery of identical attempt_id
      const res2 = await useCase.execute(payload);
      expect(res2.status).toBe("IDEMPOTENT_IGNORED");
      expect(mockDebitUseCase.execute).toHaveBeenCalledTimes(1); // not called again
      expect(inMemoryCall?.chargedAmount).toBe(150); // unchanged
    });
  });

  describe("5. Degraded Debit Graceful Handling", () => {
    it("does not abort webhook processing if wallet debit throws", async () => {
      vi.mocked(mockDebitUseCase.execute).mockRejectedValueOnce(new Error("Database connection glitch"));

      const payload = createAttemptPayload("attempt-001", "connected", 45);
      const result = await useCase.execute(payload);

      expect(result.status).toBe("SUCCESS");
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Wallet debit failed"),
        expect.any(Error),
        expect.objectContaining({ attemptId: "attempt-001" }),
      );
      // Call and attempt history are still saved
      expect(inMemoryCall?.status).toBe("COMPLETED");
      expect(inMemoryCall?.callHistory).toHaveLength(1);
    });
  });
});
