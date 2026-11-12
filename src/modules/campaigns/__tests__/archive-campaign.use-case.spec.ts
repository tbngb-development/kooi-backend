import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArchiveCampaignUseCase } from "../application/use-cases/archive-campaign.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { ControlSarvamCampaignUseCase } from "../application/use-cases/control-sarvam-campaign.use-case";
import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  CampaignNotArchivableError,
} from "../domain/errors/campaign.errors";

describe("ArchiveCampaignUseCase", () => {
  let useCase: ArchiveCampaignUseCase;
  let mockCampaignRepo: any;
  let mockControlSarvamUseCase: any;
  let mockLogger: any;

  beforeEach(() => {
    mockCampaignRepo = {
      findById: vi.fn(),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };

    mockControlSarvamUseCase = {
      execute: vi.fn().mockResolvedValue({}),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    useCase = new ArchiveCampaignUseCase(
      mockCampaignRepo as unknown as CampaignRepository,
      mockControlSarvamUseCase as unknown as ControlSarvamCampaignUseCase,
      mockLogger,
    );
  });

  it("throws CampaignNotFoundError when campaign is not found", async () => {
    mockCampaignRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute("tenant-1", "camp-123")).rejects.toThrow(
      CampaignNotFoundError,
    );
    expect(mockCampaignRepo.softDelete).not.toHaveBeenCalled();
  });

  it("throws CampaignAlreadyDeletedError when campaign is already deleted", async () => {
    mockCampaignRepo.findById.mockResolvedValue({
      id: "camp-123",
      tenantId: "tenant-1",
      status: "DRAFT",
      isDeleted: true,
      provider: "BOLNA",
    });

    await expect(useCase.execute("tenant-1", "camp-123")).rejects.toThrow(
      CampaignAlreadyDeletedError,
    );
    expect(mockCampaignRepo.softDelete).not.toHaveBeenCalled();
  });

  it("throws CampaignNotArchivableError when campaign is in non-archivable status (e.g. RUNNING for Bolna)", async () => {
    mockCampaignRepo.findById.mockResolvedValue({
      id: "camp-123",
      tenantId: "tenant-1",
      status: "RUNNING",
      isDeleted: false,
      provider: "BOLNA",
    });

    await expect(useCase.execute("tenant-1", "camp-123")).rejects.toThrow(
      CampaignNotArchivableError,
    );
    expect(mockCampaignRepo.softDelete).not.toHaveBeenCalled();
  });

  it("soft-deletes Bolna campaign without invoking Sarvam control", async () => {
    mockCampaignRepo.findById.mockResolvedValue({
      id: "camp-bolna",
      tenantId: "tenant-1",
      status: "COMPLETED",
      isDeleted: false,
      provider: "BOLNA",
    });

    await useCase.execute("tenant-1", "camp-bolna");

    expect(mockControlSarvamUseCase.execute).not.toHaveBeenCalled();
    expect(mockCampaignRepo.softDelete).toHaveBeenCalledWith(
      "tenant-1",
      "camp-bolna",
    );
  });

  it("automatically cancels active/draft Sarvam campaign upstream before soft-deleting", async () => {
    mockCampaignRepo.findById.mockResolvedValue({
      id: "camp-sarvam",
      tenantId: "tenant-1",
      status: "DRAFT",
      isDeleted: false,
      provider: "SARVAM",
      sarvamCampaignId: "srv-camp-ext-1",
    });

    await useCase.execute("tenant-1", "camp-sarvam");

    expect(mockControlSarvamUseCase.execute).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      campaignId: "camp-sarvam",
      action: "cancel",
    });
    expect(mockCampaignRepo.softDelete).toHaveBeenCalledWith(
      "tenant-1",
      "camp-sarvam",
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Upstream Sarvam campaign cancelled as part of archive",
      expect.objectContaining({
        tenantId: "tenant-1",
        campaignId: "camp-sarvam",
        sarvamCampaignId: "srv-camp-ext-1",
      }),
    );
  });

  it("skips upstream cancellation if Sarvam campaign is already CANCELLED or COMPLETED", async () => {
    mockCampaignRepo.findById.mockResolvedValue({
      id: "camp-sarvam-done",
      tenantId: "tenant-1",
      status: "CANCELLED",
      isDeleted: false,
      provider: "SARVAM",
      sarvamCampaignId: "srv-camp-ext-1",
    });

    await useCase.execute("tenant-1", "camp-sarvam-done");

    expect(mockControlSarvamUseCase.execute).not.toHaveBeenCalled();
    expect(mockCampaignRepo.softDelete).toHaveBeenCalledWith(
      "tenant-1",
      "camp-sarvam-done",
    );
  });

  it("still proceeds with soft-delete if Sarvam upstream cancel throws an error", async () => {
    mockCampaignRepo.findById.mockResolvedValue({
      id: "camp-sarvam-err",
      tenantId: "tenant-1",
      status: "PAUSED",
      isDeleted: false,
      provider: "SARVAM",
      sarvamCampaignId: "srv-camp-ext-1",
    });

    mockControlSarvamUseCase.execute.mockRejectedValue(
      new Error("Sarvam upstream network failure"),
    );

    await useCase.execute("tenant-1", "camp-sarvam-err");

    expect(mockControlSarvamUseCase.execute).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Failed to cancel upstream Sarvam campaign during archive",
      expect.objectContaining({
        campaignId: "camp-sarvam-err",
        sarvamCampaignId: "srv-camp-ext-1",
      }),
    );
    expect(mockCampaignRepo.softDelete).toHaveBeenCalledWith(
      "tenant-1",
      "camp-sarvam-err",
    );
  });
});

