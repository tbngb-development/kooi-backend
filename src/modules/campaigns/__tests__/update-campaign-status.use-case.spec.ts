import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateCampaignStatusUseCase } from "../application/use-cases/update-campaign-status.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../batches/application/interfaces/batch-repository.interface";
import {
  CampaignNotFoundError,
  SarvamAgentMaxActiveCampaignsError,
} from "../domain/errors/campaign.errors";

describe("UpdateCampaignStatusUseCase", () => {
  let useCase: UpdateCampaignStatusUseCase;
  let mockCampaignRepo: Partial<CampaignRepository>;
  let mockBatchRepo: Partial<BatchRepository>;

  const tenantId = "tenant-123";
  const campaignId = "campaign-456";

  beforeEach(() => {
    vi.clearAllMocks();

    mockCampaignRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
      countActiveCampaignsForAgent: vi.fn().mockResolvedValue(0),
    };

    mockBatchRepo = {
      cascadeStatusFromCampaign: vi.fn().mockResolvedValue(1),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined as any),
    };

    useCase = new UpdateCampaignStatusUseCase(
      mockCampaignRepo as CampaignRepository,
      mockBatchRepo as BatchRepository,
    );
  });

  it("throws CampaignNotFoundError when campaign does not exist", async () => {
    mockCampaignRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        campaignId,
        status: "RUNNING",
      }),
    ).rejects.toThrow(CampaignNotFoundError);
  });

  describe("Phase 2: Sarvam Active Campaign Capacity Enforcement", () => {
    it("rejects transition to RUNNING with SarvamAgentMaxActiveCampaignsError when agent has 5 active campaigns", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        name: "Sarvam Support Campaign",
        provider: "SARVAM",
        sarvamAgentId: "agent-sarvam-1",
        status: "PAUSED",
      } as any);

      mockCampaignRepo.countActiveCampaignsForAgent = vi
        .fn()
        .mockResolvedValue(5);

      await expect(
        useCase.execute({
          tenantId,
          campaignId,
          status: "RUNNING",
        }),
      ).rejects.toThrow(SarvamAgentMaxActiveCampaignsError);

      expect(mockCampaignRepo.countActiveCampaignsForAgent).toHaveBeenCalledWith(
        "agent-sarvam-1",
        campaignId,
      );
      expect(mockCampaignRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("allows transition to RUNNING when Sarvam agent active count is 4 (< 5)", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        name: "Sarvam Support Campaign",
        provider: "SARVAM",
        sarvamAgentId: "agent-sarvam-1",
        status: "PAUSED",
      } as any);

      mockCampaignRepo.countActiveCampaignsForAgent = vi
        .fn()
        .mockResolvedValue(4);

      mockCampaignRepo.updateStatus = vi.fn().mockResolvedValue({
        id: campaignId,
        status: "RUNNING",
      } as any);

      const result = await useCase.execute({
        tenantId,
        campaignId,
        status: "RUNNING",
      });

      expect(result.status).toBe("RUNNING");
      expect(mockCampaignRepo.countActiveCampaignsForAgent).toHaveBeenCalledWith(
        "agent-sarvam-1",
        campaignId,
      );
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        campaignId,
        "RUNNING",
        expect.objectContaining({ startedAt: expect.any(Date) }),
      );
    });

    it("allows idempotent transition to RUNNING when campaign is already RUNNING even if count is 5", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        name: "Sarvam Support Campaign",
        provider: "SARVAM",
        sarvamAgentId: "agent-sarvam-1",
        status: "RUNNING",
      } as any);

      mockCampaignRepo.countActiveCampaignsForAgent = vi
        .fn()
        .mockResolvedValue(5);

      mockCampaignRepo.updateStatus = vi.fn().mockResolvedValue({
        id: campaignId,
        status: "RUNNING",
      } as any);

      const result = await useCase.execute({
        tenantId,
        campaignId,
        status: "RUNNING",
      });

      expect(result.status).toBe("RUNNING");
      // Capacity check skipped for already running campaign
      expect(mockCampaignRepo.countActiveCampaignsForAgent).not.toHaveBeenCalled();
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        campaignId,
        "RUNNING",
        expect.anything(),
      );
    });

    it("does not enforce Sarvam capacity check for BOLNA campaigns", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        name: "Bolna Sales Campaign",
        provider: "BOLNA",
        assistantId: "assistant-1",
        status: "DRAFT",
      } as any);

      mockCampaignRepo.updateStatus = vi.fn().mockResolvedValue({
        id: campaignId,
        status: "RUNNING",
      } as any);

      const result = await useCase.execute({
        tenantId,
        campaignId,
        status: "RUNNING",
      });

      expect(result.status).toBe("RUNNING");
      expect(mockCampaignRepo.countActiveCampaignsForAgent).not.toHaveBeenCalled();
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalled();
    });

    it("allows transition to PAUSED or COMPLETED without checking capacity", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        name: "Sarvam Support Campaign",
        provider: "SARVAM",
        sarvamAgentId: "agent-sarvam-1",
        status: "RUNNING",
      } as any);

      mockCampaignRepo.updateStatus = vi.fn().mockResolvedValue({
        id: campaignId,
        status: "PAUSED",
      } as any);

      const result = await useCase.execute({
        tenantId,
        campaignId,
        status: "PAUSED",
      });

      expect(result.status).toBe("PAUSED");
      expect(mockCampaignRepo.countActiveCampaignsForAgent).not.toHaveBeenCalled();
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        campaignId,
        "PAUSED",
        {},
      );
    });
  });
});

