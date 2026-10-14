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
      countActiveLeadsInBatch: vi.fn().mockResolvedValue(0),
      countActiveCallsInBatch: vi.fn().mockResolvedValue(0),
      hasPendingRetriesInBatch: vi.fn().mockResolvedValue(false),
      countActiveLeadsInCampaignLegacy: vi.fn().mockResolvedValue(0),
      countActiveCallsInCampaignLegacy: vi.fn().mockResolvedValue(0),
      getAllBatchStatuses: vi.fn().mockResolvedValue([]),
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

    it("provisions a new call when bolnaCallId is not yet in DB even if an earlier call exists", async () => {
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
        status: "NO_ANSWER",
      });
      const newCallContext = { ...sampleResolvedCall, id: "call-2", bolnaCallId: "bolna-call-2" };
      vi.mocked(mockWebhookRepo.createCall).mockResolvedValue(newCallContext);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("bolna-call-2", {
        status: "ringing",
        batch_id: "bolna-batch-1",
        telephony_data: { to_number: "+919876543210" },
        batch_run_details: { retried: 0 },
      } as WebhookCallPayload);

      expect(result).toBe(newCallContext);
      expect(mockWebhookRepo.createCall).toHaveBeenCalledWith(
        expect.objectContaining({
          bolnaCallId: "bolna-call-2",
          status: "CALLING",
          leadId: "lead-1",
          batchId: "batch-1",
        }),
      );
    });

    it("finalizes previous attempt and provisions a brand-new call record for retry executions", async () => {
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
        status: "SCHEDULED",
      });
      const retryCallContext = { ...sampleResolvedCall, id: "call-retry-1", bolnaCallId: "bolna-call-retry-1" };
      vi.mocked(mockWebhookRepo.createCall).mockResolvedValue(retryCallContext);

      const resolver = new CallResolverService(mockWebhookRepo);
      const result = await resolver.resolveCallRecord("bolna-call-retry-1", {
        status: "in-progress",
        batch_id: "bolna-batch-1",
        telephony_data: { to_number: "+919876543210" },
        batch_run_details: { retried: 1 },
        retry_history: [
          { attempt: 1, status: "busy" },
        ],
      } as WebhookCallPayload);

      // Verify earlier attempt was finalized with true previous disposition (BUSY), not kept as SCHEDULED
      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "BUSY",
          endedAt: expect.any(Date),
        }),
      );

      // Verify a new distinct Call was created
      expect(mockWebhookRepo.createCall).toHaveBeenCalledWith(
        expect.objectContaining({
          bolnaCallId: "bolna-call-retry-1",
          status: "CALLING",
          leadId: "lead-1",
          batchId: "batch-1",
        }),
      );
      expect(mockWebhookRepo.updateCallStatusAndHistory).not.toHaveBeenCalled();
      expect(result).toBe(retryCallContext);
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

    it("does NOT mark batch COMPLETED when active/scheduled calls still remain", async () => {
      vi.mocked(mockWebhookRepo.countActiveLeadsInBatch).mockResolvedValue(0);
      vi.mocked(mockWebhookRepo.countActiveCallsInBatch).mockResolvedValue(1); // 1 scheduled retry call
      vi.mocked(mockWebhookRepo.getAllBatchStatuses).mockResolvedValue(["RUNNING"]);

      const lifecycle = new CallLifecycleService(mockWebhookRepo);
      await lifecycle.checkBatchAndCampaignCompletion(sampleResolvedCall);

      expect(mockWebhookRepo.countActiveCallsInBatch).toHaveBeenCalledWith("batch-1");
      expect(mockWebhookRepo.updateBatchStatus).not.toHaveBeenCalled();
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
          status: "NO_ANSWER",
          endedAt: expect.any(Date),
        }),
      );
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "NO_ANSWER");
      expect(mockLifecycle.checkBatchAndCampaignCompletion).not.toHaveBeenCalled();
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

    it("records each retry attempt in callHistory and terminates as BUSY once max_retries is reached", async () => {
      vi.mocked(mockWebhookRepo.findBatchStatusById).mockResolvedValue("RUNNING");

      const terminal = new CallTerminalService(mockWebhookRepo, mockLifecycle);

      // Attempt 1: Callee is busy -> Will retry, call status BUSY, history contains attempt 1
      const call1 = { ...sampleResolvedCall, callHistory: [] };
      await terminal.handleCallTerminal(call1, "BUSY", {
        id: "bolna-call-1",
        status: "busy",
        batch_run_details: { retried: 0 },
        telephony_data: { duration: 0, hangup_reason: "busy" } as any,
      });

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "BUSY",
          callHistory: [
            expect.objectContaining({
              attempt: 1,
              status: "BUSY",
              bolnaCallId: "bolna-call-1",
            }),
          ],
        }),
      );
      expect(mockLifecycle.checkBatchAndCampaignCompletion).not.toHaveBeenCalled();

      // Attempt 2: Callee is busy again -> Will retry, call status BUSY, history contains attempt 1 & 2
      const call2 = {
        ...sampleResolvedCall,
        callHistory: [
          {
            attempt: 1,
            status: "BUSY",
            bolnaCallId: "bolna-call-1",
            duration: 0,
            cost: 0,
            timestamp: "2026-10-12T10:00:00Z",
          },
        ],
      };
      await terminal.handleCallTerminal(call2, "BUSY", {
        id: "bolna-call-2",
        status: "busy",
        batch_run_details: { retried: 1 },
        telephony_data: { duration: 0, hangup_reason: "busy" } as any,
      });

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "BUSY",
          callHistory: expect.arrayContaining([
            expect.objectContaining({ attempt: 1, status: "BUSY" }),
            expect.objectContaining({ attempt: 2, status: "BUSY", bolnaCallId: "bolna-call-2" }),
          ]),
        }),
      );
      expect(mockLifecycle.checkBatchAndCampaignCompletion).not.toHaveBeenCalled();

      // Attempt 3: Callee is busy for 3rd time (max_retries = 2) -> Retries exhausted!
      // Call status must become terminal BUSY and callHistory has all 3 attempts
      const call3 = {
        ...sampleResolvedCall,
        callHistory: [
          {
            attempt: 1,
            status: "BUSY",
            bolnaCallId: "bolna-call-1",
            duration: 0,
            cost: 0,
            timestamp: "2026-10-12T10:00:00Z",
          },
          {
            attempt: 2,
            status: "BUSY",
            bolnaCallId: "bolna-call-2",
            duration: 0,
            cost: 0,
            timestamp: "2026-10-12T10:30:00Z",
          },
        ],
      };
      await terminal.handleCallTerminal(call3, "BUSY", {
        id: "bolna-call-3",
        status: "busy",
        batch_run_details: { retried: 2 },
        telephony_data: { duration: 0, hangup_reason: "busy" } as any,
      });

      expect(mockWebhookRepo.updateCallTerminalState).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          status: "BUSY",
          callHistory: expect.arrayContaining([
            expect.objectContaining({ attempt: 1 }),
            expect.objectContaining({ attempt: 2 }),
            expect.objectContaining({ attempt: 3, status: "BUSY", bolnaCallId: "bolna-call-3" }),
          ]),
        }),
      );
      expect(mockWebhookRepo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "BUSY");
      expect(mockLifecycle.checkBatchAndCampaignCompletion).toHaveBeenCalledWith(call3);
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
          callHistory: expect.arrayContaining([
            expect.objectContaining({
              attempt: 1,
              status: "COMPLETED",
              bolnaCallId: "bolna-call-1",
            }),
          ]),
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
