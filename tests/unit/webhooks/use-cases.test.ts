import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessCallWebhookUseCase } from "../../../src/modules/webhooks/application/use-cases/process-call-webhook.use-case";
import { ProcessBatchWebhookUseCase } from "../../../src/modules/webhooks/application/use-cases/process-batch-webhook.use-case";
import { WebhookResolutionError } from "../../../src/modules/webhooks/domain/errors/webhook.errors";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../../../src/modules/webhooks/application/interfaces/webhook-repository.interface";
import type {
  WebhookCallPayload,
  WebhookBatchPayload,
} from "../../../src/modules/webhooks/application/dto/webhook.dto";

describe("Webhook Use Cases", () => {
  let mockWebhookRepo: WebhookRepository;
  let mockCallResolver: any;
  let mockCallCompletion: any;
  let mockCallTerminal: any;
  let mockStopBatches: any;

  const sampleResolvedCall: ResolvedCallContext = {
    id: "call-1",
    bolnaCallId: "bolna-call-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    leadId: "lead-1",
    batchId: "batch-1",
    status: "PENDING",
    duration: null,
    cost: null,
    recording: null,
    transcript: null,
    summary: null,
    callHistory: [],
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockWebhookRepo = {
      findCallByBolnaCallId: vi.fn(),
      findCallByLeadAndBatch: vi.fn(),
      findBatchIdByBolnaBatchId: vi.fn(),
      findBatchStatusById: vi.fn(),
      findLeadByPhoneAndBatch: vi.fn(),
      findLeadByPhoneAndCampaign: vi.fn(),
      createCall: vi.fn(),
      updateCallStatusAndHistory: vi.fn(),
      updateCallTerminalState: vi.fn(),
      updateLeadStatus: vi.fn(),
      incrementTerminalStats: vi.fn(),
      countActiveLeadsInBatch: vi.fn(),
      countActiveLeadsInCampaignLegacy: vi.fn(),
      getAllBatchStatuses: vi.fn(),
      updateBatchStatus: vi.fn(),
      stopBatchCallsAndLeads: vi.fn(),
      updateCampaignStatus: vi.fn(),
      updateCallCostBreakdown: vi.fn(),
      getAgentDispositionsForCall: vi.fn(),
    };

    mockCallResolver = {
      resolveCallRecord: vi.fn().mockResolvedValue(sampleResolvedCall),
    };

    mockCallCompletion = {
      handleCallCompleted: vi.fn().mockResolvedValue(undefined),
    };

    mockCallTerminal = {
      handleCallTerminal: vi.fn().mockResolvedValue(undefined),
      handleCallCanceled: vi.fn().mockResolvedValue(undefined),
    };

    mockStopBatches = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe("ProcessCallWebhookUseCase", () => {
    it("throws WebhookResolutionError if call/execution ID is missing", async () => {
      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      const invalidPayload = { status: "completed" } as unknown as WebhookCallPayload;
      await expect(useCase.execute(invalidPayload)).rejects.toThrow(WebhookResolutionError);
    });

    it("handles initiated / ringing / in-progress events and transitions call to CALLING", async () => {
      vi.mocked(mockWebhookRepo.findBatchStatusById).mockResolvedValue("SCHEDULED");

      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
        mockStopBatches,
      );

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "in-progress",
      };

      await useCase.execute(payload);

      expect(mockCallResolver.resolveCallRecord).toHaveBeenCalledWith("bolna-call-1", payload);
      expect(mockWebhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-1",
        "bolna-call-1",
        "CALLING",
        [],
      );
      expect(mockWebhookRepo.updateBatchStatus).toHaveBeenCalledWith(
        "batch-1",
        "RUNNING",
        expect.any(Date),
      );
      expect(mockWebhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "RUNNING",
        expect.any(Date),
      );
      expect(mockStopBatches.execute).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    });

    it("ignores out-of-order in-progress event on an already COMPLETED call", async () => {
      const completedCall = { ...sampleResolvedCall, status: "COMPLETED" as const };
      mockCallResolver.resolveCallRecord.mockResolvedValue(completedCall);

      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      await useCase.execute({
        id: "bolna-call-1",
        status: "ringing",
      });

      // Must not update status to CALLING
      expect(mockWebhookRepo.updateCallStatusAndHistory).not.toHaveBeenCalled();
    });

    it("delegates completed / ended events to CallCompletionService", async () => {
      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "completed",
        telephony_data: { duration: 50 },
      };

      await useCase.execute(payload);

      expect(mockCallCompletion.handleCallCompleted).toHaveBeenCalledWith(
        sampleResolvedCall,
        payload,
        "bolna-call-1",
      );
    });

    it("delegates no-answer event to CallTerminalService with NO_ANSWER", async () => {
      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      const payload: WebhookCallPayload = {
        execution_id: "bolna-call-1",
        status: "no-answer",
      };

      await useCase.execute(payload);

      expect(mockCallTerminal.handleCallTerminal).toHaveBeenCalledWith(
        sampleResolvedCall,
        "NO_ANSWER",
        payload,
      );
    });

    it("delegates busy event to CallTerminalService with BUSY", async () => {
      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      const payload: WebhookCallPayload = {
        run_id: "bolna-call-1",
        status: "busy",
      };

      await useCase.execute(payload);

      expect(mockCallTerminal.handleCallTerminal).toHaveBeenCalledWith(
        sampleResolvedCall,
        "BUSY",
        payload,
      );
    });

    it("delegates failed / error / balance-low events to CallTerminalService with FAILED", async () => {
      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "balance-low",
      };

      await useCase.execute(payload);

      expect(mockCallTerminal.handleCallTerminal).toHaveBeenCalledWith(
        sampleResolvedCall,
        "FAILED",
        payload,
      );
    });

    it("delegates stopped / canceled events to CallTerminalService handleCallCanceled", async () => {
      const useCase = new ProcessCallWebhookUseCase(
        mockWebhookRepo,
        mockCallResolver,
        mockCallCompletion,
        mockCallTerminal,
      );

      await useCase.execute({
        id: "bolna-call-1",
        status: "stopped",
      });

      expect(mockCallTerminal.handleCallCanceled).toHaveBeenCalledWith(sampleResolvedCall);
    });
  });

  describe("ProcessBatchWebhookUseCase", () => {
    it("throws WebhookResolutionError if batch_id context is missing", async () => {
      const useCase = new ProcessBatchWebhookUseCase(mockWebhookRepo);

      await expect(
        useCase.execute({ state: "completed" } as unknown as WebhookBatchPayload),
      ).rejects.toThrow(WebhookResolutionError);
    });

    it("processes batch completed webhook and reconciles campaign completion", async () => {
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      });
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue(["COMPLETED"]);

      const useCase = new ProcessBatchWebhookUseCase(mockWebhookRepo);
      await useCase.execute({
        batch_id: "bolna-batch-1",
        state: "completed",
      });

      expect(mockWebhookRepo.updateBatchStatus).toHaveBeenCalledWith(
        "batch-1",
        "COMPLETED",
        expect.any(Date),
      );
      expect(mockWebhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "COMPLETED",
        expect.any(Date),
      );
    });

    it("preserves manual local STOPPED status if Bolna subsequently sends COMPLETED", async () => {
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "STOPPED", // stopped locally by user
      });

      const useCase = new ProcessBatchWebhookUseCase(mockWebhookRepo);
      await useCase.execute({
        batch_id: "bolna-batch-1",
        state: "completed",
      });

      // Must not overwrite local STOPPED state
      expect(mockWebhookRepo.updateBatchStatus).not.toHaveBeenCalled();
    });

    it("synchronizes remaining calls and leads to STOPPED when batch stopped by Bolna", async () => {
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      });
      vi.mocked(mockWebhookRepo.stopBatchCallsAndLeads).mockResolvedValue({
        stoppedCalls: 5,
        stoppedLeads: 10,
      });
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue(["STOPPED"]);

      const useCase = new ProcessBatchWebhookUseCase(mockWebhookRepo);
      await useCase.execute({
        batch_id: "bolna-batch-1",
        state: "stopped",
      });

      expect(mockWebhookRepo.updateBatchStatus).toHaveBeenCalledWith("batch-1", "STOPPED", undefined);
      expect(mockWebhookRepo.stopBatchCallsAndLeads).toHaveBeenCalledWith("batch-1", "MANUAL");
    });
  });
});
