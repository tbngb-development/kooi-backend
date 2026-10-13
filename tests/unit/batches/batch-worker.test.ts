import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BatchProcessingWorker,
  type BatchJobData,
} from "../../../src/modules/batches/infrastructure/jobs/batch-processing.worker";
import { BatchProcessingScheduler } from "../../../src/modules/batches/infrastructure/jobs/batch-processing.scheduler";
import axios from "axios";
import prisma from "../../../src/shared/config/database/prisma";
import { getQueue } from "../../../src/shared/config/external/queue/queue.factory";

vi.mock("axios");
vi.mock("../../../src/shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/shared/config/database/prisma", () => ({
  default: {
    leadBatch: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    campaign: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../src/shared/config/external/queue/queue.factory", () => ({
  getQueue: vi.fn(),
}));

describe("Batch Worker & Scheduler (Unit)", () => {
  const mockTenantId = "tenant-111";
  const mockCampaignId = "campaign-222";
  const mockBatchId = "batch-333";

  const sampleJobData: BatchJobData = {
    batchId: mockBatchId,
    tenantId: mockTenantId,
    campaignId: mockCampaignId,
    rawFileUrl: "https://storage.cloudinary.com/raw.csv",
    fileName: "leads.csv",
    scheduledAt: null,
    runImmediately: false,
    retryConfig: null,
    termsVersion: "v1.0",
  };

  const sampleCsvString = "contact_number,customer_name\n+919876543210,Rahul Verma\n";

  let mockBatchRepo: any;
  let mockCampaignRepo: any;
  let mockPlanRepo: any;
  let mockBolnaProvider: any;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBatchRepo = {
      findById: vi.fn().mockResolvedValue({ id: mockBatchId, status: "PROCESSING" }),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      updateProcessingError: vi.fn().mockResolvedValue(undefined),
      createLeads: vi.fn().mockResolvedValue(1),
      findExistingPhones: vi.fn().mockResolvedValue(new Set()),
      findPendingLeads: vi.fn().mockResolvedValue([
        { id: "lead-1", name: "Rahul Verma", phone: "+919876543210", email: null, company: null, metadata: {} },
      ]),
      update: vi.fn().mockResolvedValue({ id: mockBatchId, status: "CREATED" }),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
    };

    mockCampaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: mockCampaignId,
        status: "DRAFT",
        variables: {},
        assistant: {
          platformAgent: { bolnaId: "agent-bolna-777" },
        },
      }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        maxLeadsPerBatch: 1000,
      }),
    };

    mockBolnaProvider = {
      createBatch: vi.fn().mockResolvedValue({ batch_id: "bolna-batch-888" }),
      scheduleBatch: vi.fn().mockResolvedValue({ state: "scheduled at 2026-10-15T12:00:00Z" }),
    };

    mockJob = {
      data: sampleJobData,
      opts: { attempts: 3 },
      attemptsMade: 0,
    };

    (axios.get as any).mockResolvedValue({
      data: Buffer.from(sampleCsvString),
    });
  });

  describe("BatchProcessingWorker", () => {
    it("aborts job cleanly when batch was deleted before processing started", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockBatchRepo.updateProgress).not.toHaveBeenCalled();
    });

    it("fails batch with friendly message when file contains no data rows", async () => {
      (axios.get as any).mockResolvedValueOnce({
        data: Buffer.from("contact_number,customer_name\n"),
      });

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      expect(mockBatchRepo.updateProcessingError).toHaveBeenCalledWith(
        mockBatchId,
        expect.stringContaining("empty"),
      );
      expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith(mockCampaignId);
      expect(mockBolnaProvider.createBatch).not.toHaveBeenCalled();
    });

    it("fails batch when no valid Indian contact numbers are found", async () => {
      (axios.get as any).mockResolvedValueOnce({
        data: Buffer.from("contact_number,customer_name\n+14155552671,John\n"),
      });

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      expect(mockBatchRepo.updateProcessingError).toHaveBeenCalledWith(
        mockBatchId,
        expect.stringContaining("No valid Indian phone numbers"),
      );
      expect(mockBolnaProvider.createBatch).not.toHaveBeenCalled();
    });

    it("fails batch with duplicate message when 100% of leads already exist in campaign", async () => {
      mockBatchRepo.findExistingPhones.mockResolvedValueOnce(new Set(["+919876543210"]));

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      expect(mockBatchRepo.updateProcessingError).toHaveBeenCalledWith(
        mockBatchId,
        expect.stringContaining("already been added to this campaign"),
      );
      expect(mockBolnaProvider.createBatch).not.toHaveBeenCalled();
    });

    it("fails batch when leads count exceeds active plan maxLeadsPerBatch", async () => {
      mockPlanRepo.getActivePlanForTenant.mockResolvedValueOnce({
        maxLeadsPerBatch: 0,
      });

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      expect(mockBatchRepo.updateProcessingError).toHaveBeenCalledWith(
        mockBatchId,
        expect.stringContaining("current plan allows per batch"),
      );
      expect(mockBolnaProvider.createBatch).not.toHaveBeenCalled();
    });

    it("processes valid batch and completes pipeline through all stages", async () => {
      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      // Verify progression of stages
      expect(mockBatchRepo.updateProgress).toHaveBeenCalledWith(mockBatchId, "PARSING", 5);
      expect(mockBatchRepo.updateProgress).toHaveBeenCalledWith(mockBatchId, "STORING", 35);
      expect(mockBatchRepo.updateProgress).toHaveBeenCalledWith(mockBatchId, "SYNCING", 65);
      expect(mockBatchRepo.updateProgress).toHaveBeenCalledWith(mockBatchId, "FINALIZING", 90);
      expect(mockBatchRepo.updateProgress).toHaveBeenCalledWith(mockBatchId, "FINALIZING", 100);

      // Verify leads creation
      expect(mockBatchRepo.createLeads).toHaveBeenCalled();

      // Verify Bolna sync
      expect(mockBolnaProvider.createBatch).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({
          agentId: "agent-bolna-777",
          fileName: `bolna-${mockBatchId}.csv`,
        }),
      );

      // Verify batch finalized as CREATED
      expect(mockBatchRepo.update).toHaveBeenCalledWith(
        mockBatchId,
        expect.objectContaining({
          bolnaBatchId: "bolna-batch-888",
          status: "CREATED",
        }),
      );
      expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith(mockCampaignId);
    });

    it("schedules batch immediately and flips campaign status to RUNNING when runImmediately is true", async () => {
      mockJob.data.runImmediately = true;

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await worker.process(mockJob);

      expect(mockBolnaProvider.scheduleBatch).toHaveBeenCalledWith(
        mockTenantId,
        "bolna-batch-888",
        expect.any(String),
      );

      expect(mockBatchRepo.update).toHaveBeenCalledWith(
        mockBatchId,
        expect.objectContaining({
          status: "RUNNING",
        }),
      );

      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        mockCampaignId,
        "RUNNING",
        expect.objectContaining({ startedAt: expect.any(Date) }),
      );
    });

    it("marks batch as FAILED on final retry attempt and rethrows error for Bull", async () => {
      (axios.get as any).mockRejectedValueOnce(new Error("Network timeout after 30000ms"));
      mockJob.attemptsMade = 2; // this is the 3rd of 3 attempts

      const worker = new BatchProcessingWorker(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockBolnaProvider,
      );

      await expect(worker.process(mockJob)).rejects.toThrow("Network timeout after 30000ms");

      expect(mockBatchRepo.updateProcessingError).toHaveBeenCalledWith(
        mockBatchId,
        expect.stringContaining("upload took too long to process"),
      );
      expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith(mockCampaignId);
    });
  });

  describe("BatchProcessingScheduler", () => {
    let mockQueue: any;

    beforeEach(() => {
      mockQueue = {
        process: vi.fn(),
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
      (getQueue as any).mockReturnValue(mockQueue);
    });

    it("registers worker processor and cleans up stuck batches on startup", async () => {
      (prisma.leadBatch.findMany as any).mockResolvedValue([
        { id: "stuck-1" },
        { id: "stuck-2" },
      ]);
      (prisma.campaign.findMany as any).mockResolvedValue([]);

      const mockWorker = { process: vi.fn() } as any;
      const scheduler = new BatchProcessingScheduler(mockWorker);

      scheduler.start();

      expect(mockQueue.process).toHaveBeenCalledWith("process-batch", 2, expect.any(Function));
      expect(prisma.leadBatch.findMany).toHaveBeenCalledWith({
        where: { status: "PROCESSING" },
        select: { id: true },
      });

      await scheduler.stop();
      expect(mockQueue.close).toHaveBeenCalled();
    });

    it("recovers timed-out processing batches older than 5 minutes", async () => {
      const fiveMinutesOldBatches = [{ id: "timed-out-batch-1", campaignId: "campaign-1" }];
      (prisma.leadBatch.findMany as any).mockResolvedValue(fiveMinutesOldBatches);

      const mockWorker = { process: vi.fn() } as any;
      const scheduler = new BatchProcessingScheduler(mockWorker);

      // Access private autoRecoverTimedOutBatches method for verification
      await (scheduler as any).autoRecoverTimedOutBatches();

      expect(prisma.leadBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "PROCESSING" }),
          data: expect.objectContaining({
            status: "FAILED",
            processingError: expect.stringContaining("Processing timed out"),
          }),
        }),
      );
    });
  });
});
