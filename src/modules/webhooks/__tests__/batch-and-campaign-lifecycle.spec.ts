import { describe, it, expect, vi, beforeEach } from "vitest";
import { CallLifecycleService } from "../application/services/call-lifecycle.service";
import { ProcessBatchWebhookUseCase } from "../application/use-cases/process-batch-webhook.use-case";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../application/interfaces/webhook-repository.interface";
import type { WebhookBatchPayload } from "../application/dto/webhook.dto";

describe("Batch and Campaign Lifecycle Reconciliation", () => {
  let webhookRepo: Partial<WebhookRepository>;
  let callLifecycle: CallLifecycleService;
  let batchUseCase: ProcessBatchWebhookUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    webhookRepo = {
      countActiveLeadsInBatch: vi.fn().mockResolvedValue(0),
      countActiveCallsInBatch: vi.fn().mockResolvedValue(0),
      hasPendingRetriesInBatch: vi.fn().mockResolvedValue(false),
      getBatchesByCampaignId: vi.fn().mockResolvedValue([]),
      countActiveLeadsInCampaignLegacy: vi.fn().mockResolvedValue(0),
      countActiveCallsInCampaignLegacy: vi.fn().mockResolvedValue(0),
      updateBatchStatus: vi.fn().mockResolvedValue(undefined),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
      findBatchIdByBolnaBatchId: vi.fn(),
      stopBatchCallsAndLeads: vi.fn().mockResolvedValue({ stoppedCalls: 0, stoppedLeads: 0 }),
    };

    callLifecycle = new CallLifecycleService(webhookRepo as WebhookRepository);
    batchUseCase = new ProcessBatchWebhookUseCase(
      webhookRepo as WebhookRepository,
      callLifecycle,
    );
  });

  describe("Batch Lifecycle (reconcileBatchCompletion)", () => {
    it("should NOT complete batch while active calls exist (e.g. SCHEDULED, CALLING, PENDING)", async () => {
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(1);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(false);

      const completed = await callLifecycle.reconcileBatchCompletion("batch-1");

      expect(completed).toBe(false);
      expect(webhookRepo.updateBatchStatus).not.toHaveBeenCalled();
    });

    it("should NOT complete batch while active leads exist (e.g. PENDING, CALLING)", async () => {
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(2);
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(false);

      const completed = await callLifecycle.reconcileBatchCompletion("batch-1");

      expect(completed).toBe(false);
      expect(webhookRepo.updateBatchStatus).not.toHaveBeenCalled();
    });

    it("should NOT complete batch while pending retries remain in batch", async () => {
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(true);

      const completed = await callLifecycle.reconcileBatchCompletion("batch-1");

      expect(completed).toBe(false);
      expect(webhookRepo.updateBatchStatus).not.toHaveBeenCalled();
    });

    it("should complete batch when all active leads, calls, and retries are finished", async () => {
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(false);

      const completed = await callLifecycle.reconcileBatchCompletion("batch-1");

      expect(completed).toBe(true);
      expect(webhookRepo.updateBatchStatus).toHaveBeenCalledWith(
        "batch-1",
        "COMPLETED",
        expect.any(Date),
      );
    });

    it("should prevent ProcessBatchWebhookUseCase from prematurely completing a batch with pending retries", async () => {
      webhookRepo.findBatchIdByBolnaBatchId = vi.fn().mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      });

      // Pending retries exist
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(true);
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(0);

      const payload: WebhookBatchPayload = {
        batch_id: "bolna-b-1",
        state: "completed",
      };

      await batchUseCase.execute(payload);

      // The batch must NOT be marked COMPLETED
      expect(webhookRepo.updateBatchStatus).not.toHaveBeenCalledWith(
        "batch-1",
        "COMPLETED",
        expect.anything(),
      );
    });

    it("should not allow batch webhook to overwrite a manually STOPPED batch with COMPLETED", async () => {
      webhookRepo.findBatchIdByBolnaBatchId = vi.fn().mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "STOPPED",
      });

      const payload: WebhookBatchPayload = {
        batch_id: "bolna-b-1",
        state: "completed",
      };

      await batchUseCase.execute(payload);

      expect(webhookRepo.updateBatchStatus).not.toHaveBeenCalled();
    });
  });

  describe("Campaign Lifecycle (reconcileCampaignCompletion)", () => {
    it("should NOT complete campaign when another batch is RUNNING", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "COMPLETED" },
        { id: "batch-2", status: "RUNNING" },
      ]);

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalled();
    });

    it("should NOT complete campaign when another batch is SCHEDULED", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "COMPLETED" },
        { id: "batch-2", status: "SCHEDULED" },
      ]);

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalled();
    });

    it("should NOT complete campaign when another batch is PROCESSING", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "COMPLETED" },
        { id: "batch-2", status: "PROCESSING" },
      ]);

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalled();
    });

    it("should NOT complete campaign when an unstarted CREATED batch still belongs to it", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "COMPLETED" },
        { id: "batch-2", status: "CREATED" },
      ]);

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      // Per domain rule, unstarted CREATED batch keeps campaign non-terminal (RUNNING)
      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalledWith(
        "campaign-1",
        "COMPLETED",
        expect.anything(),
      );
      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalledWith(
        "campaign-1",
        "FAILED",
        expect.anything(),
      );
    });

    it("should NOT complete campaign while any child batch has pending retries", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "COMPLETED" },
        { id: "batch-2", status: "STOPPED" },
      ]);

      // batch-2 has pending retries
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockImplementation((id) =>
        Promise.resolve(id === "batch-2"),
      );

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalled();
    });

    it("should complete campaign when all batches genuinely finished without pending work", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "COMPLETED" },
        { id: "batch-2", status: "STOPPED" },
      ]);
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(false);

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      expect(webhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "COMPLETED",
        expect.any(Date),
      );
    });

    it("should transition campaign to FAILED when all batches are FAILED", async () => {
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "FAILED" },
        { id: "batch-2", status: "FAILED" },
      ]);
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.countActiveLeadsInBatch = vi.fn().mockResolvedValue(0);
      webhookRepo.hasPendingRetriesInBatch = vi.fn().mockResolvedValue(false);

      await callLifecycle.reconcileCampaignCompletion("campaign-1");

      expect(webhookRepo.updateCampaignStatus).toHaveBeenCalledWith(
        "campaign-1",
        "FAILED",
        expect.any(Date),
      );
    });

    it("should not prematurely complete campaign on single terminal call if other work remains", async () => {
      const callContext: ResolvedCallContext = {
        id: "call-1",
        bolnaCallId: "bolna-c-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        leadId: "lead-1",
        batchId: "batch-1",
        status: "COMPLETED",
        callHistory: [],
        startedAt: null,
        endedAt: null,
        updatedAt: new Date(),
        duration: 30,
        cost: 1,
        recording: null,
        transcript: null,
        summary: null,
      };

      // batch-1 still has other active calls
      webhookRepo.countActiveCallsInBatch = vi.fn().mockResolvedValue(3);
      webhookRepo.getBatchesByCampaignId = vi.fn().mockResolvedValue([
        { id: "batch-1", status: "RUNNING" },
      ]);

      await callLifecycle.checkBatchAndCampaignCompletion(callContext);

      expect(webhookRepo.updateBatchStatus).not.toHaveBeenCalledWith(
        "batch-1",
        "COMPLETED",
        expect.anything(),
      );
      expect(webhookRepo.updateCampaignStatus).not.toHaveBeenCalledWith(
        "campaign-1",
        "COMPLETED",
        expect.anything(),
      );
    });
  });
});
