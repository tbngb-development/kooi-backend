import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateBatchUseCase } from "../application/use-cases/create-batch.use-case";
import { EnqueueBatchUploadUseCase } from "../application/use-cases/enqueue-batch-upload.use-case";
import { BatchOperationError } from "../domain/errors/batch.errors";
import { LeadBatchEntity } from "../domain/entities/lead-batch.entity";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";

vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../shared/config/external/queue/queue.factory", () => ({
  getQueue: vi.fn().mockReturnValue({
    getJobs: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  }),
}));

describe("Batch Provider Inheritance & Guards", () => {
  let mockBatchRepo: BatchRepository;
  let mockCampaignRepo: CampaignRepository;
  let mockPlanRepo: PlanRepository;
  let mockStorage: FileStorageProvider;
  let mockBolnaProvider: BolnaBatchProvider;

  beforeEach(() => {
    mockBatchRepo = {
      findById: vi.fn(),
      findByCampaignId: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: "batch-1",
        campaignId: "camp-1",
        tenantId: "tenant-1",
        provider: "BOLNA",
        status: "PROCESSING",
      } as any),
      update: vi.fn(),
      updateStatus: vi.fn(),
      updateBolnaBatchId: vi.fn(),
      delete: vi.fn(),
      updateRawFileUrl: vi.fn(),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
    } as unknown as BatchRepository;

    mockCampaignRepo = {
      findByIdWithRelations: vi.fn(),
    } as unknown as CampaignRepository;

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        id: "plan-1",
        status: "ACTIVE",
        isTrial: false,
        maxActiveCampaigns: 5,
      } as any),
      countRunningCampaigns: vi.fn().mockResolvedValue(0),
      countConcurrentCampaignsAtTime: vi.fn().mockResolvedValue(0),
    } as unknown as PlanRepository;

    mockStorage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.example.com/raw.csv"),
      downloadBuffer: vi.fn(),
      deleteFile: vi.fn(),
    } as unknown as FileStorageProvider;

    mockBolnaProvider = {
      createBatch: vi.fn().mockResolvedValue("bolna-batch-1"),
      stopBatch: vi.fn(),
    } as unknown as BolnaBatchProvider;
  });

  describe("LeadBatchEntity", () => {
    it("instantiates correctly with provider and sarvamCohortId", () => {
      const batch = new LeadBatchEntity({
        id: "b-1",
        tenantId: "t-1",
        campaignId: "c-1",
        provider: "SARVAM",
        sarvamCohortId: "cohort-xyz",
        bolnaBatchId: null,
        name: "Test Batch",
        fileName: "leads.csv",
        originalFileUrl: null,
        transformedCsvUrl: null,
        rawFileUrl: null,
        status: "PROCESSING",
        totalLeads: 10,
        calledLeads: 0,
        completedLeads: 0,
        failedLeads: 0,
        retryConfig: undefined,
        bolnaScheduledAt: null,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: "1.0",
        scheduledAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        deletedAt: null,
      });

      expect(batch.provider).toBe("SARVAM");
      expect(batch.sarvamCohortId).toBe("cohort-xyz");
    });
  });

  describe("CreateBatchUseCase", () => {
    it("throws BatchOperationError when campaign has SARVAM provider", async () => {
      vi.mocked(mockCampaignRepo.findByIdWithRelations).mockResolvedValueOnce({
        id: "camp-sarvam",
        tenantId: "tenant-1",
        provider: "SARVAM",
        status: "ACTIVE",
        assistant: { id: "asst-1" },
      } as any);

      const useCase = new CreateBatchUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockStorage,
        mockBolnaProvider,
        mockPlanRepo,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          campaignId: "camp-sarvam",
          fileName: "test.csv",
          fileBuffer: Buffer.from("contact_number\n+919876543210"),
          termsAccepted: true,
          termsVersion: "1.0",
        }),
      ).rejects.toThrow(BatchOperationError);
    });
  });

  describe("EnqueueBatchUploadUseCase", () => {
    it("inherits SARVAM provider from parent campaign on batch creation", async () => {
      vi.mocked(mockCampaignRepo.findByIdWithRelations).mockResolvedValueOnce({
        id: "camp-sarvam",
        tenantId: "tenant-1",
        name: "Sarvam Campaign",
        provider: "SARVAM",
        status: "ACTIVE",
        sarvamAgentId: "agent-1",
      } as any);

      const useCase = new EnqueueBatchUploadUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockStorage,
      );

      await useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-sarvam",
        fileName: "test.csv",
        fileBuffer: Buffer.from("contact_number\n+919876543210"),
        termsAccepted: true,
        termsVersion: "1.0",
      });

      expect(mockBatchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: "camp-sarvam",
          tenantId: "tenant-1",
          provider: "SARVAM",
        }),
      );
    });

    it("inherits BOLNA provider from parent campaign on batch creation", async () => {
      vi.mocked(mockCampaignRepo.findByIdWithRelations).mockResolvedValueOnce({
        id: "camp-bolna",
        tenantId: "tenant-1",
        name: "Bolna Campaign",
        provider: "BOLNA",
        status: "ACTIVE",
        assistant: { id: "asst-1" },
      } as any);

      const useCase = new EnqueueBatchUploadUseCase(
        mockBatchRepo,
        mockCampaignRepo,
        mockPlanRepo,
        mockStorage,
      );

      await useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-bolna",
        fileName: "leads.csv",
        fileBuffer: Buffer.from("dummy csv"),
        termsAccepted: true,
        termsVersion: "1.0",
      });

      expect(mockBatchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: "camp-bolna",
          tenantId: "tenant-1",
          provider: "BOLNA",
        }),
      );
    });
  });
});
