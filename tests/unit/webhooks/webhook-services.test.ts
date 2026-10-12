import { describe, it, expect, vi, beforeEach } from "vitest";
import { CallResolverService } from "../../../src/modules/webhooks/application/services/call-resolver.service";
import { CallLifecycleService } from "../../../src/modules/webhooks/application/services/call-lifecycle.service";
import { CallTerminalService } from "../../../src/modules/webhooks/application/services/call-terminal.service";
import { CallCompletionService } from "../../../src/modules/webhooks/application/services/call-completion.service";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../../../src/modules/webhooks/application/interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../../../src/modules/webhooks/application/dto/webhook.dto";

describe("Webhook Internal Services", () => {
  let mockWebhookRepo: WebhookRepository;

  const sampleResolvedCall: ResolvedCallContext = {
    id: "call-1",
    bolnaCallId: "bolna-call-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    leadId: "lead-1",
    batchId: "batch-1",
    status: "CALLING",
    duration: null,
    cost: null,
    recording: null,
    transcript: null,
    summary: null,
    callHistory: [],
    updatedAt: new Date("2026-10-12T10:00:00Z"),
    retryConfig: {
      enabled: true,
      max_retries: 2,
      retry_on_statuses: ["no-answer", "busy"],
    },
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
  });

  describe("CallResolverService", () => {
    it("returns call immediately if found by bolnaCallId", async () => {
      vi.mocked(mockWebhookRepo.findCallByBolnaCallId).mockResolvedValue(sampleResolvedCall);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("bolna-call-1", {
        status: "in-progress",
      } as WebhookCallPayload);

      expect(result).toBe(sampleResolvedCall);
      expect(mockWebhookRepo.findCallByBolnaCallId).toHaveBeenCalledWith("bolna-call-1");
      expect(mockWebhookRepo.findBatchIdByBolnaBatchId).not.toHaveBeenCalled();
    });

    it("returns null if batch_id or phone is missing from payload when call is not found", async () => {
      vi.mocked(mockWebhookRepo.findCallByBolnaCallId).mockResolvedValue(null);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("unknown-call", {
        status: "in-progress",
      } as WebhookCallPayload);

      expect(result).toBeNull();
    });

    it("returns null if batch or lead does not exist in DB", async () => {
      vi.mocked(mockWebhookRepo.findCallByBolnaCallId).mockResolvedValue(null);
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue(null);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("unknown-call", {
        status: "in-progress",
        batch_id: "bolna-batch-99",
        telephony_data: { to_number: "+919876543210" },
      } as WebhookCallPayload);

      expect(result).toBeNull();
    });

    it("returns existing call directly if retried === 0", async () => {
      vi.mocked(mockWebhookRepo.findCallByBolnaCallId).mockResolvedValue(null);
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      });
      vi.mocked(mockWebhookRepo.findLeadByPhoneAndBatch).mockResolvedValue({ id: "lead-1" });
      vi.mocked(mockWebhookRepo.findCallByLeadAndBatch).mockResolvedValue(sampleResolvedCall);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("bolna-call-2", {
        status: "ringing",
        batch_id: "bolna-batch-1",
        telephony_data: { to_number: "+919876543210" },
        batch_run_details: { retried: 0 },
      } as WebhookCallPayload);

      expect(result).toBe(sampleResolvedCall);
      expect(mockWebhookRepo.createCall).not.toHaveBeenCalled();
    });

    it("updates status to CALLING and appends history when retried > 0", async () => {
      vi.mocked(mockWebhookRepo.findCallByBolnaCallId).mockResolvedValue(null);
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      });
      vi.mocked(mockWebhookRepo.findLeadByPhoneAndBatch).mockResolvedValue({ id: "lead-1" });
      vi.mocked(mockWebhookRepo.findCallByLeadAndBatch).mockResolvedValue({
        ...sampleResolvedCall,
        callHistory: [],
      });
      vi.mocked(mockWebhookRepo.updateCallStatusAndHistory).mockResolvedValue({
        ...sampleResolvedCall,
        status: "CALLING",
      });

      const resolver = new CallResolverService(mockWebhookRepo);
      await resolver.resolveCallRecord("bolna-call-retry-1", {
        status: "in-progress",
        batch_id: "bolna-batch-1",
        telephony_data: { to_number: "+919876543210" },
        batch_run_details: { retried: 1 },
      } as WebhookCallPayload);

      expect(mockWebhookRepo.updateCallStatusAndHistory).toHaveBeenCalledWith(
        "call-1",
        "bolna-call-retry-1",
        "CALLING",
        expect.arrayContaining([
          expect.objectContaining({
            attempt: 1,
            bolnaCallId: "bolna-call-1",
          }),
        ]),
      );
    });

    it("provisions a new call when no existing call record is found", async () => {
      vi.mocked(mockWebhookRepo.findCallByBolnaCallId).mockResolvedValue(null);
      vi.mocked(mockWebhookRepo.findBatchIdByBolnaBatchId).mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      });
      vi.mocked(mockWebhookRepo.findLeadByPhoneAndBatch).mockResolvedValue({ id: "lead-1" });
      vi.mocked(mockWebhookRepo.findCallByLeadAndBatch).mockResolvedValue(null);
      vi.mocked(mockWebhookRepo.createCall).mockResolvedValue(sampleResolvedCall);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("bolna-call-fresh", {
        status: "initiated",
        batch_id: "bolna-batch-1",
        telephony_data: { to_number: "+919876543210" },
      } as WebhookCallPayload);

      expect(mockWebhookRepo.createCall).toHaveBeenCalledWith(
        expect.objectContaining({
          bolnaCallId: "bolna-call-fresh",
          tenantId: "tenant-1",
          campaignId: "campaign-1",
          leadId: "lead-1",
          batchId: "batch-1",
          status: "CALLING",
        }),
      );
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "CALLING");
      expect(result).toBe(sampleResolvedCall);
    });
  });

  describe("CallLifecycleService", () => {
    it("marks batch COMPLETED when no active leads remain", async () => {
      vi.mocked(mockWebhookRepo.countActiveLeadsInBatch).mockResolvedValue(0);
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue(["RUNNING"]);

      const lifecycle = new CallLifecycleService(mockWebhookRepo);
      await lifecycle.checkBatchAndCampaignCompletion(sampleResolvedCall);

      expect(mockWebhookRepo.countActiveLeadsInBatch).toHaveBeenCalledWith("batch-1");
      expect(mockWebhookRepo.updateBatchStatus).toHaveBeenCalledWith(
        "batch-1",
        "COMPLETED",
        expect.any(Date),
      );
      // Still has a RUNNING batch, so campaign shouldn't be completed yet
      expect(mockWebhookRepo.updateCampaignStatus).not.toHaveBeenCalled();
    });

    it("marks campaign COMPLETED when all executed batches have finished successfully", async () => {
      vi.mocked(mockWebhookRepo.countActiveLeadsInBatch).mockResolvedValue(0);
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue([
        "COMPLETED",
        "COMPLETED",
        "CREATED", // unstarted created batch shouldn't block campaign completion
      ]);

      const lifecycle = new CallLifecycleService(mockWebhookRepo);
      await lifecycle.checkBatchAndCampaignCompletion(sampleResolvedCall);

      expect(mockWebhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "COMPLETED",
        expect.any(Date),
      );
    });

    it("marks campaign FAILED if all executed batches failed", async () => {
      vi.mocked(mockWebhookRepo.countActiveLeadsInBatch).mockResolvedValue(0);
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue([
        "FAILED",
        "FAILED",
      ]);

      const lifecycle = new CallLifecycleService(mockWebhookRepo);
      await lifecycle.checkBatchAndCampaignCompletion(sampleResolvedCall);

      expect(mockWebhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "FAILED",
        expect.any(Date),
      );
    });

    it("handles legacy campaign without batches by checking active leads in campaign", async () => {
      const callWithoutBatch = { ...sampleResolvedCall, batchId: null };
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue([]);
      vi.mocked(mockWebhookRepo.countActiveLeadsInCampaignLegacy).mockResolvedValue(0);

      const lifecycle = new CallLifecycleService(mockWebhookRepo);
      await lifecycle.checkBatchAndCampaignCompletion(callWithoutBatch);

      expect(mockWebhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "COMPLETED",
        expect.any(Date),
      );
    });
  });

  describe("CallTerminalService", () => {
    let mockLifecycle: CallLifecycleService;

    beforeEach(() => {
      mockLifecycle = new CallLifecycleService(mockWebhookRepo);
      vi.spyOn(mockLifecycle, "checkBatchAndCampaignCompletion").mockResolvedValue(undefined);
    });

    it("schedules retry if configured and max_retries not reached", async () => {
      vi.mocked(mockWebhookRepo.findBatchStatusById).mockResolvedValue("RUNNING");

      const terminal = new CallTerminalService(mockWebhookRepo, mockLifecycle);
      await terminal.handleCallTerminal(sampleResolvedCall, "NO_ANSWER");

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "SCHEDULED",
          endedAt: expect.any(Date),
        }),
      );
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "NO_ANSWER");
      expect(mockLifecycle.checkBatchAndCampaignCompletion).toHaveBeenCalledWith(sampleResolvedCall);
    });

    it("transitions call to terminal state when batch was stopped", async () => {
      vi.mocked(mockWebhookRepo.findBatchStatusById).mockResolvedValue("STOPPED");

      const terminal = new CallTerminalService(mockWebhookRepo, mockLifecycle);
      await terminal.handleCallTerminal(sampleResolvedCall, "BUSY");

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "BUSY", // Not scheduled for retry because batch is stopped
          endedAt: expect.any(Date),
        }),
      );
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "BUSY");
    });

    it("handles canceled / stopped call by transitioning both call and lead to STOPPED", async () => {
      const terminal = new CallTerminalService(mockWebhookRepo, mockLifecycle);
      await terminal.handleCallCanceled(sampleResolvedCall);

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "STOPPED",
          endedAt: expect.any(Date),
        }),
      );
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "STOPPED");
      expect(mockLifecycle.checkBatchAndCampaignCompletion).toHaveBeenCalledWith(sampleResolvedCall);
    });

    it("does not update if call is already in STOPPED status", async () => {
      const stoppedCall = { ...sampleResolvedCall, status: "STOPPED" as const };
      const terminal = new CallTerminalService(mockWebhookRepo, mockLifecycle);
      await terminal.handleCallCanceled(stoppedCall);

      expect(mockWebhookRepo.updateCallTerminalState).not.toHaveBeenCalled();
      expect(mockWebhookRepo.updateLeadStatus).not.toHaveBeenCalled();
    });
  });

  describe("CallCompletionService", () => {
    let mockLifecycle: CallLifecycleService;
    let mockDebitWallet: any;
    let mockMaterializeExtractions: any;
    let mockStopBatches: any;
    let mockClassifierQueue: any;

    beforeEach(() => {
      mockLifecycle = new CallLifecycleService(mockWebhookRepo);
      vi.spyOn(mockLifecycle, "checkBatchAndCampaignCompletion").mockResolvedValue(undefined);

      mockDebitWallet = {
        execute: vi.fn().mockResolvedValue({
          amountPaisa: 150,
          billableSeconds: 60,
          planVersionId: "pv-1",
          appliedRate: 150,
          appliedMinSec: 30,
          appliedIncrementSec: 30,
        }),
      };

      mockMaterializeExtractions = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      mockStopBatches = {
        execute: vi.fn().mockResolvedValue(undefined),
      };

      mockClassifierQueue = {
        add: vi.fn().mockResolvedValue({ id: "job-1" }),
      };
    });

    it("handles COMPLETED call, debits wallet, updates snapshot, and notifies classifier queue", async () => {
      const completion = new CallCompletionService(
        mockWebhookRepo,
        mockMaterializeExtractions,
        mockDebitWallet,
        mockStopBatches,
        mockClassifierQueue,
        mockLifecycle,
      );

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "completed",
        telephony_data: {
          duration: 45,
          recording_url: "https://recordings.bolna.ai/call-1.mp3",
        },
        messages: [
          { role: "agent", content: "Hello there", created_at: "2026-10-12T10:00:01Z" },
          { role: "user", content: "Hi, I am interested", created_at: "2026-10-12T10:00:05Z" },
        ],
        extracted_data: { interest: "high" },
        total_cost: 0.05,
      };

      await completion.handleCallCompleted(sampleResolvedCall, payload, "bolna-call-1");

      // 1. Materialize extractions called
      expect(mockMaterializeExtractions.execute).toHaveBeenCalledWith({
        callId: "call-1",
        tenantId: "tenant-1",
        extractedData: { interest: "high" },
      });

      // 2. Persisted terminal state
      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "COMPLETED",
          duration: 45,
          recording: "https://recordings.bolna.ai/call-1.mp3",
          endedAt: expect.any(Date),
        }),
      );

      // 3. Lead marked as CALLED
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "CALLED");

      // 4. Wallet debited
      expect(mockDebitWallet.execute).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        callId: "call-1",
        bolnaCallId: "bolna-call-1",
        durationSec: 45,
      });

      // 5. Cost snapshot breakdown recorded
      expect(mockWebhookRepo.updateCallCostBreakdown).toHaveBeenCalledWith("call-1", {
        platformCost: 150,
        billableSeconds: 60,
        planVersionId: "pv-1",
        appliedRate: 150,
        appliedMinSec: 30,
        appliedIncrementSec: 30,
        chargedAmount: 150,
      });

      // 6. Classifier queued
      expect(mockClassifierQueue.add).toHaveBeenCalledWith(
        { callId: "call-1", tenantId: "tenant-1" },
        { jobId: "classifier-call-1" },
      );

      // 7. Lifecycle reconciled
      expect(mockLifecycle.checkBatchAndCampaignCompletion).toHaveBeenCalledWith(sampleResolvedCall);
    });

    it("gracefully catches wallet debit failure without failing the webhook completion", async () => {
      mockDebitWallet.execute.mockRejectedValue(new Error("Database lock timeout"));

      const completion = new CallCompletionService(
        mockWebhookRepo,
        mockMaterializeExtractions,
        mockDebitWallet,
        mockStopBatches,
        mockClassifierQueue,
        mockLifecycle,
      );

      const payload: WebhookCallPayload = {
        id: "bolna-call-1",
        status: "completed",
        telephony_data: { duration: 30 },
      };

      // Must not throw
      await expect(
        completion.handleCallCompleted(sampleResolvedCall, payload, "bolna-call-1"),
      ).resolves.not.toThrow();

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalled();
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "CALLED");
    });
  });
});
