import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateBatchUseCase } from "../../../src/modules/batches/application/use-cases/create-batch.use-case";
import { RunBatchUseCase } from "../../../src/modules/batches/application/use-cases/run-batch.use-case";
import { StopBatchUseCase } from "../../../src/modules/batches/application/use-cases/stop-batch.use-case";
import { ResumeBatchUseCase } from "../../../src/modules/batches/application/use-cases/resume-batch.use-case";
import { ScheduleBatchUseCase } from "../../../src/modules/batches/application/use-cases/schedule-batch.use-case";
import { DeleteBatchUseCase } from "../../../src/modules/batches/application/use-cases/delete-batch.use-case";
import { ArchiveBatchUseCase } from "../../../src/modules/batches/application/use-cases/archive-batch.use-case";
import { RestoreBatchUseCase } from "../../../src/modules/batches/application/use-cases/restore-batch.use-case";
import { GetBatchUseCase } from "../../../src/modules/batches/application/use-cases/get-batch.use-case";
import { GetBatchStatsUseCase } from "../../../src/modules/batches/application/use-cases/get-batch-stats.use-case";
import { ListBatchesUseCase } from "../../../src/modules/batches/application/use-cases/list-batches.use-case";
import {
  BatchNotFoundError,
  BatchOperationError,
  BatchNoBolnaIdError,
  BatchActiveDeleteError,
  BatchAlreadyDeletedError,
  BatchNotDeletedError,
  BatchNotArchivableError,
  BatchNoPendingLeadsError,
  EmptyFileError,
  NoValidIndianPhonesError,
  AllLeadsDuplicateError,
  BolnaBatchCreationError,
  MaxLeadsPerBatchExceededError,
} from "../../../src/modules/batches/domain/errors/batch.errors";
import {
  CampaignNotFoundError,
  CampaignFailedError,
  MaxActiveCampaignsReachedError,
  RetryConfigNotAllowedError,
} from "../../../src/modules/campaigns/domain/errors/campaign.errors";
import {
  ScheduledCampaignConflictError,
  TenantPlanNotFoundError,
} from "../../../src/modules/plans/domain/errors/plan.errors";
import type { LeadBatchEntityData } from "../../../src/modules/batches/domain/entities/lead-batch.entity";
import type { TenantActivePlan } from "../../../src/modules/plans/domain/entities/tenant-plan.entity";

// Mock tenant freeze guard
vi.mock("../../../src/shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

describe("Batch Application Use Cases (Unit)", () => {
  const mockTenantId = "tenant-111";
  const mockCampaignId = "campaign-222";
  const mockBatchId = "batch-333";

  const sampleBatchData: LeadBatchEntityData = {
    id: mockBatchId,
    bolnaBatchId: "bolna-batch-999",
    tenantId: mockTenantId,
    campaignId: mockCampaignId,
    status: "CREATED",
    fileName: "contacts.csv",
    originalFileUrl: "https://storage.com/raw.csv",
    transformedCsvUrl: null,
    totalLeads: 25,
    calledLeads: 0,
    completedLeads: 0,
    failedLeads: 0,
    termsAccepted: true,
    termsAcceptedAt: new Date(),
    termsVersion: "v1.0",
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    deletedAt: null,
  };

  const samplePlan: TenantActivePlan = {
    tenantPlanId: "tp-1",
    tenantId: mockTenantId,
    status: "ACTIVE",
    activatedAt: new Date(),
    bonusExpiresAt: new Date(Date.now() + 86400000),
    planId: "p-1",
    planVersionId: "pv-1",
    version: 1,
    planName: "Pro Plan",
    planSlug: "pro",
    pricingModel: "STANDARD",
    onboardingFee: 0,
    perMinuteRate: 500,
    billingMinimumSec: 60,
    billingIncrementSec: 60,
    currency: "INR",
    includedMinutes: 100,
    bonusCreditsPaisa: 0,
    maxActiveCampaigns: 2,
    maxConcurrentCalls: 5,
    maxLeadsPerBatch: 1000,
    advancedAnalytics: true,
    dataRetentionDays: 90,
    customDispositions: true,
    retryAutomation: true,
    supportSlaHours: 24,
    archivedAt: null,
  };

  let mockBatchRepo: any;
  let mockCampaignRepo: any;
  let mockPlanRepo: any;
  let mockBolnaProvider: any;
  let mockStorage: any;
  let mockCheckBalance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBatchRepo = {
      list: vi.fn().mockResolvedValue([sampleBatchData]),
      findById: vi.fn().mockResolvedValue(sampleBatchData),
      findByIdWithCounts: vi.fn().mockResolvedValue({ ...sampleBatchData, _count: { leads: 25, calls: 0 } }),
      findByIdWithDetail: vi.fn().mockResolvedValue({ ...sampleBatchData, leads: [], calls: [] }),
      create: vi.fn().mockResolvedValue(sampleBatchData),
      update: vi.fn().mockImplementation((id, data) => Promise.resolve({ ...sampleBatchData, ...data })),
      delete: vi.fn().mockResolvedValue(undefined),
      createLeads: vi.fn().mockResolvedValue(25),
      getStats: vi.fn().mockResolvedValue({ totalLeads: 25, calledLeads: 0, completedLeads: 0, failedLeads: 0 }),
      findPendingLeads: vi.fn().mockResolvedValue([
        { id: "lead-1", name: "Ramesh", phone: "+919876543210", email: null, company: null, metadata: {} },
      ]),
      reassignLeadsToBatch: vi.fn().mockResolvedValue(1),
      stopBatchCallsAndLeads: vi.fn().mockResolvedValue({ stoppedCalls: 0, stoppedLeads: 25 }),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
      findExistingPhones: vi.fn().mockResolvedValue(new Set()),
      softDelete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
    };

    mockCampaignRepo = {
      findById: vi.fn().mockResolvedValue({
        id: mockCampaignId,
        status: "RUNNING",
        variables: { agent_name: "Aria" },
      }),
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: mockCampaignId,
        status: "RUNNING",
        variables: { agent_name: "Aria" },
        assistant: {
          platformAgent: { bolnaId: "agent-bolna-xyz" },
        },
      }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue(samplePlan),
      countRunningCampaigns: vi.fn().mockResolvedValue(1),
      countConcurrentCampaignsAtTime: vi.fn().mockResolvedValue(0),
    };

    mockBolnaProvider = {
      createBatch: vi.fn().mockResolvedValue({ batch_id: "new-bolna-batch-id" }),
      scheduleBatch: vi.fn().mockResolvedValue({ state: "scheduled at 2026-10-15T10:00:00Z" }),
      stopBatch: vi.fn().mockResolvedValue({ message: "Batch stopped" }),
      deleteBatch: vi.fn().mockResolvedValue(undefined),
    };

    mockStorage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.cloudinary.com/raw-leads.csv"),
    };

    mockCheckBalance = {
      execute: vi.fn().mockResolvedValue({ warning: false, balance: 50000, estimatedCost: 1000 }),
    };
  });

  // =========================================================================
  // 1. RunBatchUseCase
  // =========================================================================
  describe("RunBatchUseCase", () => {
    it("throws BatchNotFoundError when batch does not exist", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);
      const useCase = new RunBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider, mockPlanRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("throws BatchOperationError when batch is not in CREATED status", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "RUNNING" });
      const useCase = new RunBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider, mockPlanRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchOperationError,
      );
    });

    it("throws BatchNoBolnaIdError when batch has no bolnaBatchId", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, bolnaBatchId: null });
      const useCase = new RunBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider, mockPlanRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNoBolnaIdError,
      );
    });

    it("throws CampaignNotFoundError when campaign does not exist", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce(null);
      const useCase = new RunBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider, mockPlanRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it("throws MaxActiveCampaignsReachedError when campaign is DRAFT and plan running campaign quota is reached", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({ id: mockCampaignId, status: "DRAFT" });
      mockPlanRepo.countRunningCampaigns.mockResolvedValueOnce(2); // quota is 2
      const useCase = new RunBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider, mockPlanRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        MaxActiveCampaignsReachedError,
      );
    });

    it("schedules batch at Bolna and updates batch status to RUNNING", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({ id: mockCampaignId, status: "DRAFT" });
      const useCase = new RunBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockBolnaProvider,
        mockPlanRepo,
        mockCheckBalance,
      );

      const result = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);

      expect(mockBolnaProvider.scheduleBatch).toHaveBeenCalledWith(
        mockTenantId,
        sampleBatchData.bolnaBatchId,
        expect.any(String),
      );
      expect(mockBatchRepo.update).toHaveBeenCalledWith(
        mockBatchId,
        expect.objectContaining({ status: "RUNNING" }),
      );
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        mockCampaignId,
        "RUNNING",
        expect.any(Object),
      );
      expect(result.batch.status).toBe("RUNNING");
    });

    it("attaches balanceWarning when checkBalance returns warning", async () => {
      mockCheckBalance.execute.mockResolvedValueOnce({ warning: true, balance: 1000, estimatedCost: 5000 });
      const useCase = new RunBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockBolnaProvider,
        mockPlanRepo,
        mockCheckBalance,
      );

      const result = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);
      expect(result.balanceWarning).toEqual({ balance: 1000, estimatedCost: 5000 });
    });
  });

  // =========================================================================
  // 2. StopBatchUseCase
  // =========================================================================
  describe("StopBatchUseCase", () => {
    it("throws CampaignNotFoundError when campaign does not exist", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce(null);
      const useCase = new StopBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it("throws BatchNotFoundError when batch does not exist", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);
      const useCase = new StopBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("returns early when batch is already STOPPED, COMPLETED, or FAILED", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "STOPPED" });
      const useCase = new StopBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider);

      const res = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);
      expect(res.message).toBe("This batch is already inactive.");
      expect(res.bolnaStopped).toBe(false);
      expect(mockBolnaProvider.stopBatch).not.toHaveBeenCalled();
    });

    it("calls bolnaProvider.stopBatch and marks calls and leads stopped", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "RUNNING" });
      const useCase = new StopBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider);

      const res = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);

      expect(mockBolnaProvider.stopBatch).toHaveBeenCalledWith(mockTenantId, sampleBatchData.bolnaBatchId);
      expect(mockBatchRepo.update).toHaveBeenCalledWith(mockBatchId, { status: "STOPPED" });
      expect(mockBatchRepo.stopBatchCallsAndLeads).toHaveBeenCalledWith(mockBatchId, "MANUAL");
      expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith(mockCampaignId);
      expect(res.bolnaStopped).toBe(true);
      expect(res.status).toBe("STOPPED");
    });

    it("force-stops batch locally when Bolna API throws an error", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "RUNNING" });
      mockBolnaProvider.stopBatch.mockRejectedValueOnce(new Error("Bolna 404 Not Found"));
      const useCase = new StopBatchUseCase(mockBatchRepo, mockCampaignRepo, mockBolnaProvider);

      const res = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);

      expect(mockBatchRepo.update).toHaveBeenCalledWith(mockBatchId, { status: "STOPPED" });
      expect(mockBatchRepo.stopBatchCallsAndLeads).toHaveBeenCalledWith(mockBatchId, "MANUAL");
      expect(res.bolnaStopped).toBe(false);
      expect(res.status).toBe("STOPPED");
      expect(res.message).toContain("Batch force-stopped locally");
    });
  });

  // =========================================================================
  // 3. ResumeBatchUseCase
  // =========================================================================
  describe("ResumeBatchUseCase", () => {
    it("throws BatchNotFoundError when batch does not exist", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);
      const useCase = new ResumeBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("throws BatchOperationError when batch is not in STOPPED status", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "RUNNING" });
      const useCase = new ResumeBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchOperationError,
      );
    });

    it("throws BatchNoPendingLeadsError when no pending leads remain", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "STOPPED" });
      mockBatchRepo.findPendingLeads.mockResolvedValueOnce([]);
      const useCase = new ResumeBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNoPendingLeadsError,
      );
    });

    it("creates a new batch, reassigns leads, and calls Bolna provider", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "STOPPED" });
      const newCreatedBatch = { ...sampleBatchData, id: "new-batch-444" };
      mockBatchRepo.create.mockResolvedValueOnce(newCreatedBatch);

      const useCase = new ResumeBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockCheckBalance,
      );

      const result = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);

      expect(mockCheckBalance.execute).toHaveBeenCalled();
      expect(mockBatchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: `resume-${sampleBatchData.fileName}`,
          totalLeads: 1,
        }),
      );
      expect(mockBatchRepo.reassignLeadsToBatch).toHaveBeenCalledWith(mockBatchId, "new-batch-444");
      expect(mockBolnaProvider.createBatch).toHaveBeenCalled();
      expect(mockBatchRepo.update).toHaveBeenCalledWith("new-batch-444", {
        bolnaBatchId: "new-bolna-batch-id",
      });
      expect(result.remainingLeads).toBe(1);
    });

    it("throws BolnaBatchCreationError when Bolna fails during resume batch creation", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "STOPPED" });
      mockBolnaProvider.createBatch.mockRejectedValueOnce(new Error("Rate limit exceeded"));

      const useCase = new ResumeBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BolnaBatchCreationError,
      );
    });
  });

  // =========================================================================
  // 4. ScheduleBatchUseCase
  // =========================================================================
  describe("ScheduleBatchUseCase", () => {
    const futureDateStr = new Date(Date.now() + 3600000).toISOString();

    it("throws BatchNotFoundError when batch is missing", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);
      const useCase = new ScheduleBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId, futureDateStr)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("throws BatchOperationError when scheduledAt is in the past", async () => {
      const pastDateStr = new Date(Date.now() - 3600000).toISOString();
      const useCase = new ScheduleBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId, pastDateStr)).rejects.toThrow(
        BatchOperationError,
      );
    });

    it("throws ScheduledCampaignConflictError when concurrent campaigns overlap at target time", async () => {
      mockPlanRepo.countConcurrentCampaignsAtTime.mockResolvedValueOnce(2); // quota is 2
      const useCase = new ScheduleBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId, futureDateStr)).rejects.toThrow(
        ScheduledCampaignConflictError,
      );
    });

    it("schedules batch at Bolna and updates local status to SCHEDULED", async () => {
      const useCase = new ScheduleBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockBolnaProvider,
        mockPlanRepo,
        mockCheckBalance,
      );

      const result = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId, futureDateStr);

      expect(mockBolnaProvider.scheduleBatch).toHaveBeenCalledWith(
        mockTenantId,
        sampleBatchData.bolnaBatchId,
        expect.any(String),
      );
      expect(mockBatchRepo.update).toHaveBeenCalledWith(
        mockBatchId,
        expect.objectContaining({ status: "SCHEDULED" }),
      );
      expect(result.batch.status).toBe("SCHEDULED");
    });
  });

  // =========================================================================
  // 5. DeleteBatchUseCase
  // =========================================================================
  describe("DeleteBatchUseCase", () => {
    it("throws BatchNotFoundError when batch does not exist", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);
      const useCase = new DeleteBatchUseCase(mockBatchRepo, mockBolnaProvider);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("throws BatchActiveDeleteError when batch is currently active (RUNNING or SCHEDULED)", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "RUNNING" });
      const useCase = new DeleteBatchUseCase(mockBatchRepo, mockBolnaProvider);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchActiveDeleteError,
      );
    });

    it("soft deletes batch and attempts Bolna batch deletion", async () => {
      const useCase = new DeleteBatchUseCase(mockBatchRepo, mockBolnaProvider);
      const result = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);

      expect(mockBolnaProvider.deleteBatch).toHaveBeenCalledWith(mockTenantId, sampleBatchData.bolnaBatchId);
      expect(mockBatchRepo.softDelete).toHaveBeenCalledWith(mockTenantId, mockCampaignId, mockBatchId);
      expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith(mockCampaignId);
      expect(result.message).toBe("Batch deleted successfully");
    });
  });

  // =========================================================================
  // 6. ArchiveBatchUseCase & RestoreBatchUseCase
  // =========================================================================
  describe("ArchiveBatchUseCase & RestoreBatchUseCase", () => {
    it("throws BatchNotFoundError when batch to archive does not exist", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce(null);
      const useCase = new ArchiveBatchUseCase(mockBatchRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("throws BatchAlreadyDeletedError when batch is already archived", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, isDeleted: true });
      const useCase = new ArchiveBatchUseCase(mockBatchRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchAlreadyDeletedError,
      );
    });

    it("throws BatchNotArchivableError when batch is in RUNNING or PROCESSING state", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, status: "PROCESSING" });
      const useCase = new ArchiveBatchUseCase(mockBatchRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotArchivableError,
      );
    });

    it("archives batch when conditions are satisfied", async () => {
      const useCase = new ArchiveBatchUseCase(mockBatchRepo);
      await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);

      expect(mockBatchRepo.softDelete).toHaveBeenCalledWith(mockTenantId, mockCampaignId, mockBatchId);
    });

    it("restores archived batch when isDeleted is true", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, isDeleted: true });
      const useCase = new RestoreBatchUseCase(mockBatchRepo);

      await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);
      expect(mockBatchRepo.restore).toHaveBeenCalledWith(mockTenantId, mockCampaignId, mockBatchId);
    });

    it("throws BatchNotDeletedError when attempting to restore non-archived batch", async () => {
      mockBatchRepo.findById.mockResolvedValueOnce({ ...sampleBatchData, isDeleted: false });
      const useCase = new RestoreBatchUseCase(mockBatchRepo);

      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotDeletedError,
      );
    });
  });

  // =========================================================================
  // 7. Get, List, Stats Use Cases
  // =========================================================================
  describe("GetBatchUseCase, GetBatchStatsUseCase, ListBatchesUseCase", () => {
    it("GetBatchUseCase returns batch details or throws BatchNotFoundError", async () => {
      const useCase = new GetBatchUseCase(mockBatchRepo);
      const res = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);
      expect(res.id).toBe(mockBatchId);

      mockBatchRepo.findByIdWithDetail.mockResolvedValueOnce(null);
      await expect(useCase.execute(mockTenantId, mockCampaignId, mockBatchId)).rejects.toThrow(
        BatchNotFoundError,
      );
    });

    it("GetBatchStatsUseCase returns stats", async () => {
      const useCase = new GetBatchStatsUseCase(mockBatchRepo);
      const stats = await useCase.execute(mockTenantId, mockCampaignId, mockBatchId);
      expect(stats.totalLeads).toBe(25);
    });

    it("ListBatchesUseCase lists active and deleted batches or throws CampaignNotFoundError", async () => {
      const useCase = new ListBatchesUseCase(mockBatchRepo, mockCampaignRepo);
      const list = await useCase.execute(mockTenantId, mockCampaignId, false);
      expect(list).toHaveLength(1);
      expect(mockBatchRepo.list).toHaveBeenCalledWith(mockTenantId, mockCampaignId, false);

      mockCampaignRepo.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(mockTenantId, mockCampaignId, false)).rejects.toThrow(
        CampaignNotFoundError,
      );
    });
  });

  // =========================================================================
  // 8. CreateBatchUseCase
  // =========================================================================
  describe("CreateBatchUseCase", () => {
    const validCsvBuffer = Buffer.from("contact_number,customer_name\n+919876543210,Aditi Sharma\n");

    it("throws CampaignFailedError when campaign status is FAILED", async () => {
      mockCampaignRepo.findByIdWithRelations.mockResolvedValueOnce({
        id: mockCampaignId,
        status: "FAILED",
        assistant: { platformAgent: { bolnaId: "agent-1" } },
      });

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: validCsvBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(CampaignFailedError);
    });

    it("throws TenantPlanNotFoundError when active plan is missing", async () => {
      mockPlanRepo.getActivePlanForTenant.mockResolvedValueOnce(null);

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: validCsvBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(TenantPlanNotFoundError);
    });

    it("throws EmptyFileError when file has no rows", async () => {
      const emptyBuffer = Buffer.from("contact_number,customer_name\n");
      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: emptyBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(EmptyFileError);
    });

    it("throws NoValidIndianPhonesError when file contains no valid Indian phones", async () => {
      const nonIndianBuffer = Buffer.from("contact_number,customer_name\n+14155552671,John Doe\n");
      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: nonIndianBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(NoValidIndianPhonesError);
    });

    it("throws AllLeadsDuplicateError when all leads are duplicates of existing campaign leads", async () => {
      mockBatchRepo.findExistingPhones.mockResolvedValueOnce(new Set(["+919876543210"]));

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: validCsvBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(AllLeadsDuplicateError);
    });

    it("throws MaxLeadsPerBatchExceededError when new leads exceed plan limit", async () => {
      mockPlanRepo.getActivePlanForTenant.mockResolvedValueOnce({
        ...samplePlan,
        maxLeadsPerBatch: 0, // 0 limit
      });

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: validCsvBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(MaxLeadsPerBatchExceededError);
    });

    it("throws RetryConfigNotAllowedError when retry automation is disabled by plan", async () => {
      mockPlanRepo.getActivePlanForTenant.mockResolvedValueOnce({
        ...samplePlan,
        retryAutomation: false,
      });

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: validCsvBuffer,
          retryConfig: { enabled: true, maxRetries: 2, retryIntervalMinutes: 10 },
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(RetryConfigNotAllowedError);
    });

    it("throws BolnaBatchCreationError and marks batch as FAILED when Bolna API throws", async () => {
      mockBolnaProvider.createBatch.mockRejectedValueOnce(new Error("Bolna 503 Service Unavailable"));

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: mockTenantId,
          campaignId: mockCampaignId,
          fileName: "leads.csv",
          fileBuffer: validCsvBuffer,
          termsAccepted: true,
          termsVersion: "v1.0",
        }),
      ).rejects.toThrow(BolnaBatchCreationError);

      expect(mockBatchRepo.update).toHaveBeenCalledWith(sampleBatchData.id, { status: "FAILED" });
    });

    it("creates batch successfully with CREATED status when neither runImmediately nor scheduledAt is set", async () => {
      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      const result = await useCase.execute({
        tenantId: mockTenantId,
        campaignId: mockCampaignId,
        fileName: "leads.csv",
        fileBuffer: validCsvBuffer,
        termsAccepted: true,
        termsVersion: "v1.0",
      });

      expect(mockBatchRepo.create).toHaveBeenCalled();
      expect(mockBatchRepo.createLeads).toHaveBeenCalled();
      expect(mockBolnaProvider.createBatch).toHaveBeenCalled();
      expect(result.stats.imported).toBe(1);
      expect(result.message).toContain("staged successfully");
    });
  });
});
