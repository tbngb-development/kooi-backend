import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnqueueBatchUploadUseCase } from "../application/use-cases/enqueue-batch-upload.use-case";
import {
  CampaignNotEligibleForUploadError,
  CampaignExpiredError,
  CampaignNotFoundError,
} from "../../campaigns/domain/errors/campaign.errors";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";

vi.mock("../../../../shared/config/external/queue/queue.factory", () => ({
  getQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getWaitingCount: vi.fn().mockResolvedValue(0),
  }),
}));

describe("EnqueueBatchUploadUseCase (Phase 1 Lifecycle Guards)", () => {
  let useCase: EnqueueBatchUploadUseCase;
  let mockBatchRepo: any;
  let mockCampaignRepo: any;
  let mockPlanRepo: any;
  let mockStorage: any;

  const tenantId = "tenant-1";
  const campaignId = "camp-sarvam-1";

  beforeEach(() => {
    mockBatchRepo = {
      create: vi.fn().mockResolvedValue({ id: "batch-1", status: "PROCESSING" }),
      updateRawFileUrl: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue({ id: "batch-1", status: "PROCESSING" }),
    };

    mockCampaignRepo = {
      findByIdWithRelations: vi.fn(),
      countActiveCampaignsAtTime: vi.fn().mockResolvedValue(0),
      countActiveCampaigns: vi.fn().mockResolvedValue(0),
    };

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        id: "plan-1",
        status: "ACTIVE",
        isTrial: false,
        maxActiveCampaigns: 5,
        maxLeadsPerBatch: 1000,
      }),
    };

    mockStorage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.example.com/raw.csv"),
    };

    useCase = new EnqueueBatchUploadUseCase(
      mockBatchRepo as unknown as BatchRepository,
      mockCampaignRepo as unknown as CampaignRepository,
      mockPlanRepo as unknown as PlanRepository,
      mockStorage as unknown as FileStorageProvider,
    );
  });

  it("throws CampaignNotEligibleForUploadError when Sarvam campaign is COMPLETED", async () => {
    mockCampaignRepo.findByIdWithRelations.mockResolvedValue({
      id: campaignId,
      tenantId,
      provider: "SARVAM",
      status: "COMPLETED",
      sarvamAgentId: "agent-1",
    });

    const input = {
      tenantId,
      campaignId,
      fileBuffer: Buffer.from("Contact Number\n+919876543210"),
      fileName: "leads.csv",
      termsAccepted: true,
    };

    await expect(useCase.execute(input)).rejects.toThrow(
      CampaignNotEligibleForUploadError,
    );
  });

  it("throws CampaignNotEligibleForUploadError when Sarvam campaign is CANCELLED", async () => {
    mockCampaignRepo.findByIdWithRelations.mockResolvedValue({
      id: campaignId,
      tenantId,
      provider: "SARVAM",
      status: "CANCELLED",
      sarvamAgentId: "agent-1",
    });

    const input = {
      tenantId,
      campaignId,
      fileBuffer: Buffer.from("Contact Number\n+919876543210"),
      fileName: "leads.csv",
      termsAccepted: true,
    };

    await expect(useCase.execute(input)).rejects.toThrow(
      CampaignNotEligibleForUploadError,
    );
  });

  it("throws CampaignExpiredError when Sarvam campaign endTimestamp is in the past", async () => {
    mockCampaignRepo.findByIdWithRelations.mockResolvedValue({
      id: campaignId,
      tenantId,
      provider: "SARVAM",
      status: "RUNNING",
      sarvamAgentId: "agent-1",
      endTimestamp: new Date(Date.now() - 60000), // 1 minute ago
    });

    const input = {
      tenantId,
      campaignId,
      fileBuffer: Buffer.from("Contact Number\n+919876543210"),
      fileName: "leads.csv",
      termsAccepted: true,
    };

    await expect(useCase.execute(input)).rejects.toThrow(CampaignExpiredError);
  });

  it("allows upload when Sarvam campaign is active and not expired", async () => {
    mockCampaignRepo.findByIdWithRelations.mockResolvedValue({
      id: campaignId,
      tenantId,
      provider: "SARVAM",
      status: "RUNNING",
      sarvamAgentId: "agent-1",
      endTimestamp: new Date(Date.now() + 86400000), // 1 day in the future
    });

    const input = {
      tenantId,
      campaignId,
      fileBuffer: Buffer.from("Contact Number\n+919876543210"),
      fileName: "leads.csv",
      termsAccepted: true,
    };

    const result = await useCase.execute(input);

    expect(result).toEqual({
      batchId: "batch-1",
      status: "PROCESSING",
      message: "Your file is being processed. You'll see the leads appear shortly.",
    });
    expect(mockBatchRepo.create).toHaveBeenCalled();
  });

  it("does not apply Sarvam eligibility checks to Bolna campaigns", async () => {
    mockCampaignRepo.findByIdWithRelations.mockResolvedValue({
      id: "camp-bolna-1",
      tenantId,
      provider: "BOLNA",
      status: "PAUSED",
      assistant: { id: "asst-1" },
      endTimestamp: new Date(Date.now() - 60000),
    });

    const input = {
      tenantId,
      campaignId: "camp-bolna-1",
      fileBuffer: Buffer.from("Contact Number\n+919876543210"),
      fileName: "leads.csv",
      termsAccepted: true,
    };

    const result = await useCase.execute(input);
    expect(result.status).toBe("PROCESSING");
  });
});
