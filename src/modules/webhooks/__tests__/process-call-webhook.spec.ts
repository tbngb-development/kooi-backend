import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessCallWebhookUseCase } from "../application/use-cases/process-call-webhook.use-case";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../application/interfaces/webhook-repository.interface";
import type { CallResolverService } from "../application/services/call-resolver.service";
import type { CallCompletionService } from "../application/services/call-completion.service";
import type { CallTerminalService } from "../application/services/call-terminal.service";
import type { WebhookCallPayload } from "../application/dto/webhook.dto";

describe("ProcessCallWebhookUseCase - Retry & Lifecycle", () => {
  let webhookRepo: Partial<WebhookRepository>;
  let callResolver: Partial<CallResolverService>;
  let callCompletion: Partial<CallCompletionService>;
  let callTerminal: Partial<CallTerminalService>;
  let useCase: ProcessCallWebhookUseCase;

  const mockResolvedCall: ResolvedCallContext = {
    id: "call-uuid-1",
    bolnaCallId: "bolna-call-1",
    tenantId: "tenant-uuid-1",
    campaignId: "campaign-uuid-1",
    assistantId: "assistant-uuid-1",
    leadId: "lead-uuid-1",
    batchId: "batch-uuid-1",
    type: "OUTBOUND",
    source: "CAMPAIGN",
    status: "NO_ANSWER",
    agentNumber: "+1234567890",
    duration: 0,
    cost: 0,
    recording: null,
    transcript: null,
    summary: null,
    callHistory: [
      {
        attempt: 1,
        bolnaCallId: "bolna-call-1",
        status: "NO_ANSWER",
        duration: 0,
        cost: 0,
        timestamp: "2026-10-30T10:00:00.000Z",
        errorMessage: null,
        hangupReason: "no-answer",
      },
    ],
    startedAt: new Date("2026-10-30T10:00:00.000Z"),
    endedAt: new Date("2026-10-30T10:00:15.000Z"),
    updatedAt: new Date(),
    retryConfig: {
      enabled: true,
      max_retries: 2,
      retry_on_statuses: ["no-answer", "busy", "failed"],
    },
    campaignDefaultRetryConfig: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    webhookRepo = {
      findBatchStatusById: vi.fn().mockResolvedValue("RUNNING"),
      updateCallStatusAndHistory: vi.fn().mockResolvedValue({} as ResolvedCallContext),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      updateBatchStatus: vi.fn().mockResolvedValue(undefined),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
    };

    callResolver = {
      resolveCallRecord: vi.fn().mockResolvedValue({ ...mockResolvedCall }),
    };

    callCompletion = {
      handleCallCompleted: vi.fn().mockResolvedValue(undefined),
    };

    callTerminal = {
      handleCallTerminal: vi.fn().mockResolvedValue(undefined),
      handleCallCanceled: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new ProcessCallWebhookUseCase(
      webhookRepo as WebhookRepository,
      callResolver as CallResolverService,
      callCompletion as CallCompletionService,
      callTerminal as CallTerminalService,
    );
  });

  describe("Retry handling on scheduled and rescheduled events", () => {
    it("should transition NO_ANSWER -> SCHEDULED when Bolna schedules a retry", async () => {
      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "scheduled",
        retry_history: [
          {
            attempt: 1,
            status: "no-answer",
            duration: 0,
            created_at: "2026-10-30T10:00:00.000Z",
          },
        ],
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-uuid-1",
        "bolna-call-1",
        "SCHEDULED",
        expect.arrayContaining([
          expect.objectContaining({
            attempt: 1,
            status: "NO-ANSWER",
          }),
        ]),
      );
      expect(webhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-uuid-1", "NO_ANSWER");
      expect(webhookRepo.updateBatchStatus).toHaveBeenCalledWith("batch-uuid-1", "RUNNING");
      expect(webhookRepo.updateCampaignStatus).toHaveBeenCalledWith("campaign-uuid-1", "RUNNING");
    });

    it("should transition BUSY -> SCHEDULED when Bolna schedules a retry", async () => {
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "BUSY",
        callHistory: [
          {
            attempt: 1,
            bolnaCallId: "bolna-call-1",
            status: "BUSY",
            timestamp: "2026-10-30T10:00:00.000Z",
          },
        ],
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "scheduled",
        retry_history: [
          {
            attempt: 1,
            status: "busy",
          },
        ],
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-uuid-1",
        "bolna-call-1",
        "SCHEDULED",
        expect.any(Array),
      );
      expect(webhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-uuid-1", "BUSY");
    });

    it("should transition FAILED -> SCHEDULED when Bolna schedules a retry", async () => {
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "FAILED",
        callHistory: [
          {
            attempt: 1,
            bolnaCallId: "bolna-call-1",
            status: "FAILED",
            timestamp: "2026-10-30T10:00:00.000Z",
          },
        ],
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "rescheduled",
        retry_history: [
          {
            attempt: 1,
            status: "failed",
          },
        ],
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-uuid-1",
        "bolna-call-1",
        "SCHEDULED",
        expect.any(Array),
      );
      expect(webhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-uuid-1", "FAILED");
    });

    it("should handle duplicate scheduled events idempotently without corrupting history", async () => {
      // Call is already SCHEDULED from the first webhook
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "SCHEDULED",
        callHistory: [
          {
            attempt: 1,
            bolnaCallId: "bolna-call-1",
            status: "NO_ANSWER",
            timestamp: "2026-10-30T10:00:00.000Z",
          },
        ],
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "scheduled",
        retry_history: [
          {
            attempt: 1,
            status: "no-answer",
            duration: 0,
            created_at: "2026-10-30T10:00:00.000Z",
          },
        ],
      };

      await useCase.execute(payload);

      // Does not push a duplicate attempt 1
      expect(webhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-uuid-1",
        "bolna-call-1",
        "SCHEDULED",
        [
          expect.objectContaining({
            attempt: 1,
          }),
        ],
      );
      const mockCalls = vi.mocked(webhookRepo.updateCallStatusAndHistory)?.mock?.calls ?? [];
      const passedHistory = mockCalls[0]?.[3];
      expect(passedHistory).toHaveLength(1);
    });

    it("should not regress COMPLETED call when a late scheduled event arrives", async () => {
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "COMPLETED",
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "scheduled",
        retry_history: [{ attempt: 1, status: "no-answer" }],
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).not.toHaveBeenCalled();
    });

    it("should not regress STOPPED call when a scheduled event arrives", async () => {
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "STOPPED",
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "scheduled",
        retry_history: [{ attempt: 1, status: "no-answer" }],
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).not.toHaveBeenCalled();
    });

    it("should not transition to SCHEDULED if retries are exhausted", async () => {
      // 1 initial + 2 retries = 3 total attempts executed
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "NO_ANSWER",
        callHistory: [
          { attempt: 1, status: "NO_ANSWER" },
          { attempt: 2, status: "NO_ANSWER" },
          { attempt: 3, status: "NO_ANSWER" },
        ],
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "scheduled",
        retry_history: [
          { attempt: 1, status: "no-answer" },
          { attempt: 2, status: "no-answer" },
          { attempt: 3, status: "no-answer" },
        ],
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).not.toHaveBeenCalled();
    });
  });

  describe("In-flight retry attempt starting (SCHEDULED -> CALLING)", () => {
    it("should transition SCHEDULED -> CALLING when retry attempt begins dialing", async () => {
      callResolver.resolveCallRecord = vi.fn().mockResolvedValue({
        ...mockResolvedCall,
        status: "SCHEDULED",
      });

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "in-progress",
      };

      await useCase.execute(payload);

      expect(webhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-uuid-1",
        "bolna-call-1",
        "CALLING",
        expect.arrayContaining([
          expect.objectContaining({ attempt: 1, status: "NO_ANSWER" }),
          expect.objectContaining({
            attempt: 2,
            bolnaCallId: "bolna-call-1",
            status: "CALLING",
            startedAt: expect.any(String),
            endedAt: null,
          }),
        ]),
        null,
        expect.objectContaining({
          startedAt: expect.any(Date),
          endedAt: null,
        }),
      );
      expect(webhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-uuid-1", "CALLING");
    });
  });
});
