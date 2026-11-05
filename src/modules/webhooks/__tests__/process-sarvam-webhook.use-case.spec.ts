import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessSarvamWebhookUseCase } from "../application/use-cases/process-sarvam-webhook.use-case";
import type { SarvamLeadCorrelationService } from "../application/services/sarvam-lead-correlation.service";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
  SarvamAttemptHistoryEntry,
} from "../application/interfaces/sarvam-webhook-repository.interface";
import type { SarvamWebhookAttemptPayload } from "../application/dto/sarvam-webhook.dto";
import type { Logger } from "../../../shared/logging/logger.interface";
import { UnauthorizedError } from "../../../shared/errors/unauthorized.error";
import { AppError } from "../../../shared/errors/app.error";

describe("ProcessSarvamWebhookUseCase", () => {
  let useCase: ProcessSarvamWebhookUseCase;
  let mockCorrelationService: SarvamLeadCorrelationService;
  let mockRepo: ISarvamWebhookRepository;
  let mockLogger: Logger;

  const tenantId = "tenant-sarvam-1";
  const campaignId = "camp-sarvam-101";
  const batchId = "batch-sarvam-202";
  const leadId = "lead-sarvam-303";
  const callId = "call-kooi-aggregate-1";
  const sarvamCampaignId = "sarvam-camp-ext-1";
  const sarvamCohortId = "sarvam-cohort-ext-2";
  const sarvamAgentId = "agent-sarvam-app-1";
  const userPhoneNumber = "+919876543210";
  const userIdentifier = "usr-ref-999";
  const testSecret = "test-sarvam-secret-xyz";

  const defaultCorrelationSuccess = {
    success: true as const,
    data: {
      tenantId,
      campaign: {
        id: campaignId,
        name: "Q1 Campaign",
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
        metadata: { account_id: "ACC-555" },
      },
      normalizedPhone: userPhoneNumber,
    },
  };

  const basePayload: SarvamWebhookAttemptPayload = {
    app_id: "agent-sarvam-app-1",
    app_version: 1,
    attempt_id: "attempt-uuid-001",
    campaign_id: sarvamCampaignId,
    cohort_id: sarvamCohortId,
    completion_status: "completed",
    connectivity_status: "connected",
    next_action_status: null,
    failure_reason: null,
    user_identifier: userIdentifier,
    user_phone_number: userPhoneNumber,
    agent_phone_number: "+918041234567",
    duration: 45.2,
    interaction_id: "inter-sarvam-001",
    retry_attempt: 0,
    executed_at: "2026-04-01T10:00:00Z",
    start_datetime: "2026-04-01T10:00:05Z",
    end_datetime: "2026-04-01T10:00:50Z",
    initial_agent_variables: { customer_name: "Rohan Gupta" },
    final_agent_variables: { payment_confirmed: "yes" },
    output_agent_variables: { payment_confirmed: "yes" },
    interaction_transcript: [
      { role: "agent", en_text: "Hello Rohan, this is an automated confirmation." },
      { role: "user", en_text: "Yes, I confirmed." },
    ],
    metadata: {
      tenantId,
      campaignId,
      secret: testSecret,
    },
  };

  let inMemoryCall: AggregateCallCandidate | null = null;
  let inMemoryLeadStatus = "CALLING";

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.SARVAM_WEBHOOK_SECRET = testSecret;

    inMemoryCall = null;
    inMemoryLeadStatus = "CALLING";

    mockCorrelationService = {
      correlate: vi.fn().mockResolvedValue(defaultCorrelationSuccess),
    } as unknown as SarvamLeadCorrelationService;

    mockRepo = {
      executeInAdvisoryLock: vi.fn().mockImplementation(async (_lockKey, op) => {
        return op(mockRepo);
      }),
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
        };
      }),
      updateLeadStatus: vi.fn().mockImplementation(async (_leadId, status) => {
        inMemoryLeadStatus = status;
      }),
      findSarvamAgentForTenant: vi.fn().mockResolvedValue(null),
      getCallAnalysis: vi.fn().mockResolvedValue(null),
      upsertCallAnalysisOutputVariables: vi.fn().mockResolvedValue(undefined),
    } as unknown as ISarvamWebhookRepository;

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
    );
  });

  describe("1. First Attempt Creation", () => {
    it("creates an initial aggregate Call row and sets attempt in callHistory", async () => {
      const result = await useCase.execute(basePayload);

      expect(result.status).toBe("SUCCESS");
      expect(result.callId).toBe(callId);
      expect(result.attemptId).toBe("attempt-uuid-001");

      expect(mockRepo.createAggregateCall).toHaveBeenCalledTimes(1);
      const createCallArg = vi.mocked(mockRepo.createAggregateCall).mock.calls[0][0];

      expect(createCallArg.tenantId).toBe(tenantId);
      expect(createCallArg.campaignId).toBe(campaignId);
      expect(createCallArg.batchId).toBe(batchId);
      expect(createCallArg.leadId).toBe(leadId);
      expect(createCallArg.provider).toBe("SARVAM");
      expect(createCallArg.status).toBe("COMPLETED");
      expect(createCallArg.sarvamAttemptId).toBe("attempt-uuid-001");
      expect(createCallArg.sarvamUserIdentifier).toBe(userIdentifier);
      expect(createCallArg.duration).toBe(45);
      expect(createCallArg.transcript).toContain("Agent: Hello Rohan");
      expect(createCallArg.transcript).toContain("User: Yes, I confirmed.");
      expect(createCallArg.extractionResult).toEqual({ payment_confirmed: "yes" });

      expect(createCallArg.callHistory).toHaveLength(1);
      const historyEntry = createCallArg.callHistory[0];
      expect(historyEntry.attempt_id).toBe("attempt-uuid-001");
      expect(historyEntry.connectivity_status).toBe("connected");
      expect(historyEntry.completion_status).toBe("completed");
      expect(historyEntry.status).toBe("COMPLETED");

      expect(mockRepo.updateLeadStatus).toHaveBeenCalledWith(leadId, "CALLED");
    });
  });

  describe("2. Subsequent Attempts & Multiple Attempts for One Lead", () => {
    it("appends subsequent attempt to callHistory without creating a duplicate Call row", async () => {
      // 1st attempt: busy with retry scheduled
      const attempt1: SarvamWebhookAttemptPayload = {
        ...basePayload,
        attempt_id: "attempt-001",
        retry_attempt: 0,
        connectivity_status: "busy",
        completion_status: "failed",
        next_action_status: "retry",
        failure_reason: "User busy",
        duration: null,
        interaction_transcript: null,
      };

      await useCase.execute(attempt1);

      expect(mockRepo.createAggregateCall).toHaveBeenCalledTimes(1);
      expect(inMemoryCall?.status).toBe("BUSY");
      expect(inMemoryLeadStatus).toBe("CALLING"); // Retrying, lead remains in calling

      // 2nd attempt: connected and completed
      const attempt2: SarvamWebhookAttemptPayload = {
        ...basePayload,
        attempt_id: "attempt-002",
        retry_attempt: 1,
        connectivity_status: "connected",
        completion_status: "completed",
        next_action_status: null, // Terminal attempt
        duration: 52.4,
        interaction_transcript: [
          { role: "agent", en_text: "Hello again Rohan" },
          { role: "user", en_text: "Done" },
        ],
      };

      const result2 = await useCase.execute(attempt2);

      expect(result2.status).toBe("SUCCESS");
      expect(mockRepo.createAggregateCall).toHaveBeenCalledTimes(1); // STILL only 1 call created!
      expect(mockRepo.updateAggregateCall).toHaveBeenCalledTimes(1);

      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history).toHaveLength(2);
      expect(history[0].attempt_id).toBe("attempt-001");
      expect(history[0].status).toBe("BUSY");
      expect(history[1].attempt_id).toBe("attempt-002");
      expect(history[1].status).toBe("COMPLETED");

      // Aggregate call fields reflect latest attempt
      expect(inMemoryCall?.status).toBe("COMPLETED");
      expect(inMemoryCall?.duration).toBe(52);
      expect(inMemoryCall?.sarvamAttemptId).toBe("attempt-002");
      expect(inMemoryCall?.transcript).toContain("Hello again Rohan");

      // Terminal attempt transitions Lead to CALLED
      expect(inMemoryLeadStatus).toBe("CALLED");
    });
  });

  describe("3. Idempotency & Concurrency Safety", () => {
    it("ignores duplicate deliveries with the same attempt_id without appending to history", async () => {
      await useCase.execute(basePayload);
      expect(mockRepo.createAggregateCall).toHaveBeenCalledTimes(1);

      // Redeliver exact same webhook payload
      const dupResult = await useCase.execute(basePayload);

      expect(dupResult.status).toBe("IDEMPOTENT_IGNORED");
      expect(dupResult.attemptId).toBe("attempt-uuid-001");
      expect(mockRepo.createAggregateCall).toHaveBeenCalledTimes(1);
      expect(mockRepo.updateAggregateCall).not.toHaveBeenCalled();

      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history).toHaveLength(1);
    });

    it("serializes execution using PostgreSQL advisory lock on (leadId, batchId)", async () => {
      await useCase.execute(basePayload);

      expect(mockRepo.executeInAdvisoryLock).toHaveBeenCalledWith(
        `sarvam-call:${leadId}:${batchId}`,
        expect.any(Function),
      );
    });
  });

  describe("4. Status & Disposition Mappings", () => {
    it("maps busy non-retryable attempt to CallStatus.BUSY and LeadStatus.BUSY", async () => {
      const payload: SarvamWebhookAttemptPayload = {
        ...basePayload,
        connectivity_status: "busy",
        completion_status: "failed",
        next_action_status: null,
      };

      await useCase.execute(payload);

      expect(inMemoryCall?.status).toBe("BUSY");
      expect(inMemoryLeadStatus).toBe("BUSY");
    });

    it("maps no_answer non-retryable attempt to CallStatus.NO_ANSWER and LeadStatus.NO_ANSWER", async () => {
      const payload: SarvamWebhookAttemptPayload = {
        ...basePayload,
        connectivity_status: "no_answer",
        completion_status: "failed",
        next_action_status: null,
      };

      await useCase.execute(payload);

      expect(inMemoryCall?.status).toBe("NO_ANSWER");
      expect(inMemoryLeadStatus).toBe("NO_ANSWER");
    });

    it("maps failed non-retryable attempt to CallStatus.FAILED and LeadStatus.FAILED", async () => {
      const payload: SarvamWebhookAttemptPayload = {
        ...basePayload,
        connectivity_status: "failed",
        completion_status: "failed",
        next_action_status: null,
        failure_reason: "Carrier rejected call",
      };

      await useCase.execute(payload);

      expect(inMemoryCall?.status).toBe("FAILED");
      expect(inMemoryLeadStatus).toBe("FAILED");
      const history = inMemoryCall?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history[0].failure_reason).toBe("Carrier rejected call");
    });

    it("keeps LeadStatus in CALLING when next_action_status indicates retryable state", async () => {
      const payload: SarvamWebhookAttemptPayload = {
        ...basePayload,
        connectivity_status: "no_answer",
        completion_status: "failed",
        next_action_status: "reschedule",
      };

      await useCase.execute(payload);

      expect(inMemoryCall?.status).toBe("NO_ANSWER");
      expect(inMemoryLeadStatus).toBe("CALLING");
    });
  });

  describe("5. Missing Optional Fields & Data Protection", () => {
    it("does not overwrite existing transcript or duration with null values from incomplete webhooks", async () => {
      // 1st attempt: has full transcript & duration
      await useCase.execute(basePayload);
      expect(inMemoryCall?.transcript).toBeTruthy();
      expect(inMemoryCall?.duration).toBe(45);

      // 2nd attempt: incomplete or missing transcript/duration
      const partialPayload: SarvamWebhookAttemptPayload = {
        ...basePayload,
        attempt_id: "attempt-uuid-002",
        duration: null,
        interaction_transcript: null,
        output_agent_variables: null,
        next_action_status: null,
      };

      await useCase.execute(partialPayload);

      // Verify previous non-null data is preserved on aggregate call
      expect(inMemoryCall?.transcript).toBeTruthy();
      expect(inMemoryCall?.duration).toBe(45);
    });
  });

  describe("6. Authentication & Validation", () => {
    it("rejects malformed payloads with 400 AppError", async () => {
      await expect(
        useCase.execute({ invalid: "payload" }),
      ).rejects.toThrow(AppError);
    });

    it("rejects unauthorized webhook when metadata secret and headers do not match", async () => {
      const unauthorizedPayload = {
        ...basePayload,
        metadata: { secret: "wrong-secret" },
      };

      await expect(
        useCase.execute(unauthorizedPayload),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("accepts valid webhook via x-webhook-secret header even if metadata secret is absent", async () => {
      const noMetaPayload = {
        ...basePayload,
        metadata: null,
      };

      const result = await useCase.execute(noMetaPayload, {
        "x-webhook-secret": testSecret,
      });

      expect(result.status).toBe("SUCCESS");
    });
  });

  describe("7. Correlation Rejection Handling", () => {
    it("acknowledges correlation rejections without throwing or creating calls", async () => {
      vi.mocked(mockCorrelationService.correlate).mockResolvedValueOnce({
        success: false,
        failure: {
          code: "UNKNOWN_CAMPAIGN",
          message: "No campaign found",
        },
      });

      const result = await useCase.execute(basePayload);

      expect(result.status).toBe("CORRELATION_REJECTED");
      expect(result.reason).toBe("No campaign found");
      expect(mockRepo.createAggregateCall).not.toHaveBeenCalled();
    });
  });
});
