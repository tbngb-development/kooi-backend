import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateBatchUseCase } from "../application/use-cases/create-batch.use-case";
import { ResumeBatchUseCase } from "../application/use-cases/resume-batch.use-case";
import { BatchProcessingWorker } from "../infrastructure/jobs/batch-processing.worker";
import { PrismaBatchRepository } from "../infrastructure/repositories/prisma-batch.repository";
import prisma from "../../../shared/config/database/prisma";
import { generateBolnaBatchFilename, parseBolnaBatchFilename } from "../domain/rules/batch-filename.rules";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";
import type { IPhoneNumberRepository } from "../../phone-numbers/application/interfaces/phone-number-repository.interface";
import axios from "axios";

describe("Bolna CSV Upload Filename Convention & Lifecycle", () => {
  const tenantId = "tenant-uuid-1111";
  const campaignAId = "8f21e54a-3df1-4a58-86d9-768565261882";
  const campaignBId = "b91d034b-7685-4b21-98a1-348512398412";

  let mockBatchRepo: Partial<BatchRepository>;
  let mockCampaignRepo: Partial<CampaignRepository>;
  let mockPlanRepo: Partial<PlanRepository>;
  let mockStorage: Partial<FileStorageProvider>;
  let mockBolnaProvider: Partial<BolnaBatchProvider>;
  let mockPhoneRepo: Partial<IPhoneNumberRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBatchRepo = {
      create: vi.fn().mockImplementation((data) => ({
        id: "batch-uuid-0001-aaaa-bbbb",
        campaignId: data.campaignId,
        tenantId: data.tenantId,
        fileName: data.fileName,
        totalLeads: data.totalLeads,
        createdAt: new Date("2026-10-30T10:00:00.000Z"),
      })),
      createLeads: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue({}),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
      findExistingPhones: vi.fn().mockResolvedValue(new Set()),
      findPendingLeads: vi.fn().mockResolvedValue([
        {
          id: "lead-1",
          name: "John Doe",
          phone: "+919876543210",
          email: "john@example.com",
          company: "Acme",
        },
      ]),
      reassignCampaignLeadsToBatch: vi.fn().mockResolvedValue(1),
      reassignLeadsToBatch: vi.fn().mockResolvedValue(1),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue({
        id: "batch-uuid-0001-aaaa-bbbb",
        campaignId: campaignAId,
        tenantId,
        status: "STOPPED",
        totalLeads: 1,
        retryConfig: { enabled: false },
      }),
    };

    mockCampaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: campaignAId,
        tenantId,
        name: "Q4 Outreach",
        status: "DRAFT",
        assistant: {
          platformAgent: {
            bolnaId: "bolna-agent-1",
          },
        },
        variables: {},
        defaultRetryConfig: null,
      }),
      findById: vi.fn().mockResolvedValue({
        id: campaignAId,
        tenantId,
        name: "Q4 Outreach",
        status: "STOPPED",
        assistant: {
          platformAgent: {
            bolnaId: "bolna-agent-1",
          },
        },
        variables: {},
      }),
    };

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        isTrial: false,
        maxActiveCampaigns: 10,
        maxLeadsPerBatch: 1000,
        retryAutomation: true,
      }),
      countRunningCampaigns: vi.fn().mockResolvedValue(0),
    };

    mockStorage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.example.com/raw.csv"),
    };

    mockBolnaProvider = {
      createBatch: vi.fn().mockResolvedValue({
        batch_id: "bolna-batch-999",
      }),
    };

    mockPhoneRepo = {
      findOutboundPhoneNumbers: vi.fn().mockResolvedValue([]),
    };
  });

  it("1. Sequential batch numbering within a campaign produces zero-padded sequences", () => {
    const batch1Name = generateBolnaBatchFilename({
      batchSequence: 1,
      batchId: "batch-1111-uuid",
      campaignId: campaignAId,
    });
    const batch2Name = generateBolnaBatchFilename({
      batchSequence: 2,
      batchId: "batch-2222-uuid",
      campaignId: campaignAId,
    });
    const batch10Name = generateBolnaBatchFilename({
      batchSequence: 10,
      batchId: "batch-3333-uuid",
      campaignId: campaignAId,
    });

    expect(batch1Name).toBe("batch-01-lb_batch111-cmp_8f21e54a.csv");
    expect(batch2Name).toBe("batch-02-lb_batch222-cmp_8f21e54a.csv");
    expect(batch10Name).toBe("batch-10-lb_batch333-cmp_8f21e54a.csv");

    const parsed1 = parseBolnaBatchFilename(batch1Name);
    expect(parsed1?.batchSequence).toBe(1);
    const parsed2 = parseBolnaBatchFilename(batch2Name);
    expect(parsed2?.batchSequence).toBe(2);
    const parsed10 = parseBolnaBatchFilename(batch10Name);
    expect(parsed10?.batchSequence).toBe(10);
  });

  it("2. Different campaigns with identical names generate distinct, campaign-traceable filenames", () => {
    // Both campaigns are named "Outreach Campaign", but have different IDs
    const fileCampA = generateBolnaBatchFilename({
      batchSequence: 1,
      batchId: "batch-uuid-aaaa",
      campaignId: campaignAId,
    });
    const fileCampB = generateBolnaBatchFilename({
      batchSequence: 1,
      batchId: "batch-uuid-bbbb",
      campaignId: campaignBId,
    });

    expect(fileCampA).not.toBe(fileCampB);
    expect(fileCampA).toBe("batch-01-lb_batchuui-cmp_8f21e54a.csv");
    expect(fileCampB).toBe("batch-01-lb_batchuui-cmp_b91d034b.csv");

    const parsedA = parseBolnaBatchFilename(fileCampA);
    const parsedB = parseBolnaBatchFilename(fileCampB);
    expect(parsedA?.shortCampaignId).toBe("cmp_8f21e54a");
    expect(parsedB?.shortCampaignId).toBe("cmp_b91d034b");
  });

  it("3. Unique filename generation for different lead batches", () => {
    const file1 = generateBolnaBatchFilename({
      batchSequence: 1,
      batchId: "11112222-3333-4444-5555-666677778888",
      campaignId: campaignAId,
    });
    const file2 = generateBolnaBatchFilename({
      batchSequence: 2,
      batchId: "99998888-7777-6666-5555-444433332222",
      campaignId: campaignAId,
    });

    expect(file1).toBe("batch-01-lb_11112222-cmp_8f21e54a.csv");
    expect(file2).toBe("batch-02-lb_99998888-cmp_8f21e54a.csv");
    expect(file1).not.toBe(file2);
  });

  it("4. Extension is always .csv and allowed-character constraints are met", () => {
    const filename = generateBolnaBatchFilename({
      batchSequence: 42,
      batchId: "lb_test-id-1234",
      campaignId: "cmp_campaign-id-5678",
    });

    expect(filename.endsWith(".csv")).toBe(true);
    // Standard filename constraint: only alphanumeric, hyphen, underscore, and single extension dot
    expect(/^[a-zA-Z0-9_-]+\.csv$/.test(filename)).toBe(true);
  });

  it("5. Actual filename passed to Bolna upload in CreateBatchUseCase", async () => {
    (mockBatchRepo.getBatchSequenceNumber as any).mockResolvedValueOnce(3);

    const useCase = new CreateBatchUseCase(
      mockBatchRepo as BatchRepository,
      mockCampaignRepo as CampaignRepository,
      mockStorage as FileStorageProvider,
      mockBolnaProvider as BolnaBatchProvider,
      mockPlanRepo as PlanRepository,
    );

    const sampleCsv = "name,phone\nAlice,+919876543210\n";
    await useCase.execute({
      tenantId,
      campaignId: campaignAId,
      fileName: "original-user-leads.csv",
      fileBuffer: Buffer.from(sampleCsv),
      termsAccepted: true,
      termsVersion: "v1.0",
    });

    expect(mockBolnaProvider.createBatch).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        fileName: "batch-03-lb_batchuui-cmp_8f21e54a.csv",
      }),
    );
  });

  it("6. Actual filename passed to Bolna upload in ResumeBatchUseCase", async () => {
    (mockBatchRepo.getBatchSequenceNumber as any).mockResolvedValueOnce(5);

    const resumeUseCase = new ResumeBatchUseCase(
      mockBatchRepo as BatchRepository,
      mockCampaignRepo as CampaignRepository,
      mockStorage as FileStorageProvider,
      mockBolnaProvider as BolnaBatchProvider,
    );

    await resumeUseCase.execute(tenantId, campaignAId, "original-batch-uuid");

    expect(mockBolnaProvider.createBatch).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        fileName: "batch-05-lb_batchuui-cmp_8f21e54a.csv",
      }),
    );
  });

  it("7. Actual filename passed to Bolna upload in BatchProcessingWorker", async () => {
    (mockBatchRepo.getBatchSequenceNumber as any).mockResolvedValueOnce(4);

    const worker = new BatchProcessingWorker(
      mockBatchRepo as BatchRepository,
      mockCampaignRepo as CampaignRepository,
      mockPlanRepo as PlanRepository,
      mockBolnaProvider as BolnaBatchProvider,
      mockPhoneRepo as IPhoneNumberRepository,
    );

    const sampleCsv = "name,phone\nBob,+919876543211\n";
    vi.spyOn(axios, "get").mockResolvedValue({
      data: Buffer.from(sampleCsv),
    });

    const mockJob = {
      id: "job-1",
      opts: { attempts: 3 },
      attemptsMade: 0,
      data: {
        batchId: "batch-uuid-0001-aaaa-bbbb",
        tenantId,
        campaignId: campaignAId,
        rawFileUrl: "https://example.com/raw.csv",
        fileName: "leads.csv",
        scheduledAt: null,
        runImmediately: false,
        retryConfig: null,
        termsVersion: "v1.0",
      },
    };

    await worker.process(mockJob as any);

    expect(mockBolnaProvider.createBatch).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        fileName: "batch-04-lb_batchuui-cmp_8f21e54a.csv",
      }),
    );
  });

  it("8. Concurrency safety: tie-breaking ensures deterministic ranking under identical timestamps", () => {
    // Simulated Prisma SQL query tie-breaker logic:
    // WHERE createdAt < target.createdAt OR (createdAt = target.createdAt AND id <= target.id)
    const batches = [
      { id: "batch-aaa-1", createdAt: new Date("2026-10-30T10:00:00.000Z") },
      { id: "batch-bbb-2", createdAt: new Date("2026-10-30T10:00:00.000Z") },
    ];

    const getSimulatedRank = (targetId: string) => {
      const target = batches.find((b) => b.id === targetId)!;
      return batches.filter(
        (b) =>
          b.createdAt < target.createdAt ||
          (b.createdAt.getTime() === target.createdAt.getTime() && b.id <= target.id),
      ).length;
    };

    expect(getSimulatedRank("batch-aaa-1")).toBe(1);
    expect(getSimulatedRank("batch-bbb-2")).toBe(2);

    const fn1 = generateBolnaBatchFilename({
      batchSequence: getSimulatedRank("batch-aaa-1"),
      batchId: "batch-aaa-1",
      campaignId: campaignAId,
    });
    const fn2 = generateBolnaBatchFilename({
      batchSequence: getSimulatedRank("batch-bbb-2"),
      batchId: "batch-bbb-2",
      campaignId: campaignAId,
    });

    expect(fn1).toBe("batch-01-lb_batchaaa-cmp_8f21e54a.csv");
    expect(fn2).toBe("batch-02-lb_batchbbb-cmp_8f21e54a.csv");
    expect(fn1).not.toBe(fn2);
  });

  describe("PrismaBatchRepository.getBatchSequenceNumber", () => {
    it("should count preceding batches accurately using Prisma", async () => {
      vi.spyOn(prisma.leadBatch, "findUnique").mockResolvedValueOnce({
        createdAt: new Date("2026-10-30T10:00:00.000Z"),
      } as any);

      vi.spyOn(prisma.leadBatch, "count").mockResolvedValueOnce(3);

      const repo = new PrismaBatchRepository();
      const sequence = await repo.getBatchSequenceNumber(
        campaignAId,
        "batch-target-uuid",
      );

      expect(sequence).toBe(3);
      expect(prisma.leadBatch.count).toHaveBeenCalledWith({
        where: {
          campaignId: campaignAId,
          OR: [
            { createdAt: { lt: new Date("2026-10-30T10:00:00.000Z") } },
            {
              createdAt: new Date("2026-10-30T10:00:00.000Z"),
              id: { lte: "batch-target-uuid" },
            },
          ],
        },
      });
    });

    it("should return fallback 1 if target batch does not exist in DB", async () => {
      vi.spyOn(prisma.leadBatch, "findUnique").mockResolvedValueOnce(null);

      const repo = new PrismaBatchRepository();
      const sequence = await repo.getBatchSequenceNumber(
        campaignAId,
        "non-existent-batch",
      );

      expect(sequence).toBe(1);
    });
  });
});
