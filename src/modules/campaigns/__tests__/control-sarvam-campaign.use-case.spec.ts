import { describe, it, expect, vi, beforeEach } from "vitest";
// modules/campaigns/__tests__/control-sarvam-campaign.use-case.spec.ts

import { ControlSarvamCampaignUseCase } from "../application/use-cases/control-sarvam-campaign.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../batches/application/interfaces/batch-repository.interface";
import type { ISarvamCampaignClient } from "../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import {
  CampaignNotFoundError,
  SarvamAgentMaxActiveCampaignsError,
} from "../domain/errors/campaign.errors";
import { AppError } from "../../../shared/errors/app.error";

describe("ControlSarvamCampaignUseCase", () => {
  let useCase: ControlSarvamCampaignUseCase;
  let mockCampaignRepo: any;
  let mockBatchRepo: any;
  let mockSarvamClient: any;
  let mockEncryptionService: any;

  beforeEach(() => {
    mockCampaignRepo = {
      findById: vi.fn(),
      findSarvamAgentWithApiKey: vi.fn(),
      updateSarvamStatus: vi.fn(),
      countActiveCampaignsForAgent: vi.fn().mockResolvedValue(0),
    };

    mockBatchRepo = {
      cascadeStatusFromCampaign: vi.fn(),
      recalculateCampaignStats: vi.fn(),
    };

    mockSarvamClient = {
      updateStatus: vi.fn(),
    };

    mockEncryptionService = {
      encrypt: vi.fn(),
      decrypt: vi.fn().mockReturnValue("decrypted-api-key"),
    };

    useCase = new ControlSarvamCampaignUseCase(
      mockCampaignRepo as unknown as CampaignRepository,
      mockBatchRepo as unknown as BatchRepository,
      mockSarvamClient as unknown as ISarvamCampaignClient,
      mockEncryptionService,
    );
  });

  it("throws CampaignNotFoundError when campaign is not found", async () => {
    mockCampaignRepo.findById!.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: "tenant-1",
        campaignId: "non-existent",
        action: "pause",
      }),
    ).rejects.toThrow(CampaignNotFoundError);
  });

  it("throws AppError if campaign provider is not SARVAM", async () => {
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      provider: "BOLNA",
    } as any);

    await expect(
      useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-1",
        action: "pause",
      }),
    ).rejects.toThrow(AppError);
  });

  it("throws AppError if campaign is missing Sarvam IDs", async () => {
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      provider: "SARVAM",
      sarvamCampaignId: null,
      sarvamAgentId: null,
    } as any);

    await expect(
      useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-1",
        action: "pause",
      }),
    ).rejects.toThrow("Campaign is missing external Sarvam identifiers");
  });

  it("executes pause action successfully and updates status to PAUSED", async () => {
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      tenantId: "tenant-1",
      provider: "SARVAM",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
    } as any);

    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      apiKey: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.updateStatus!.mockResolvedValue({
      campaign_id: "srv-camp-1",
      name: "Campaign 1",
      status: "paused",
      app_id: "agent-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockCampaignRepo.updateSarvamStatus!.mockResolvedValue({
      id: "camp-1",
      status: "PAUSED",
      sarvamStatus: "paused",
    } as any);

    const result = await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      action: "pause",
    });

    expect(mockSarvamClient.updateStatus).toHaveBeenCalledWith(
      "org-1",
      "ws-1",
      "srv-camp-1",
      "decrypted-api-key",
      "pause",
    );
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-1",
      "paused",
      "PAUSED",
      undefined,
    );
    expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith("camp-1");
    expect(result.status).toBe("PAUSED");
  });

  it("executes resume action successfully and updates status to RUNNING", async () => {
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      tenantId: "tenant-1",
      provider: "SARVAM",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "PAUSED",
    } as any);

    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      apiKey: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.updateStatus!.mockResolvedValue({
      campaign_id: "srv-camp-1",
      name: "Campaign 1",
      status: "active",
      app_id: "agent-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockCampaignRepo.updateSarvamStatus!.mockResolvedValue({
      id: "camp-1",
      status: "RUNNING",
      sarvamStatus: "active",
    } as any);

    const result = await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      action: "resume",
    });

    expect(mockSarvamClient.updateStatus).toHaveBeenCalledWith(
      "org-1",
      "ws-1",
      "srv-camp-1",
      "decrypted-api-key",
      "resume",
    );
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-1",
      "active",
      "RUNNING",
      undefined,
    );
    expect(result.status).toBe("RUNNING");
  });

  it("executes cancel action, cascades STOPPED to batches, and sets completedAt", async () => {
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      tenantId: "tenant-1",
      provider: "SARVAM",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
    } as any);

    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      apiKey: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.updateStatus!.mockResolvedValue({
      campaign_id: "srv-camp-1",
      name: "Campaign 1",
      status: "cancelled",
      app_id: "agent-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockCampaignRepo.updateSarvamStatus!.mockResolvedValue({
      id: "camp-1",
      status: "CANCELLED",
      sarvamStatus: "cancelled",
    } as any);

    const result = await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      action: "cancel",
    });

    expect(mockSarvamClient.updateStatus).toHaveBeenCalledWith(
      "org-1",
      "ws-1",
      "srv-camp-1",
      "decrypted-api-key",
      "cancel",
    );
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-1",
      "cancelled",
      "CANCELLED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
    expect(mockBatchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
      "camp-1",
      "STOPPED",
    );
    expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith("camp-1");
    expect(result.status).toBe("CANCELLED");
  });

  describe("Phase 2: Active Campaign Capacity (Max 5 per Sarvam Agent)", () => {
    it("rejects resume with SarvamAgentMaxActiveCampaignsError when agent has 5 running campaigns", async () => {
      mockCampaignRepo.findById!.mockResolvedValue({
        id: "camp-resume",
        tenantId: "tenant-1",
        provider: "SARVAM",
        sarvamCampaignId: "srv-camp-resume",
        sarvamAgentId: "agent-1",
        status: "PAUSED",
      } as any);

      mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
        id: "agent-1",
        name: "Sales Support Agent",
        apiKey: {
          organizationId: "org-1",
          workspaceId: "ws-1",
          apiKeyEncrypted: "encrypted-key",
        },
      } as any);

      // 5 campaigns currently RUNNING for this agent
      mockCampaignRepo.countActiveCampaignsForAgent.mockResolvedValue(5);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          campaignId: "camp-resume",
          action: "resume",
        }),
      ).rejects.toThrow(SarvamAgentMaxActiveCampaignsError);

      expect(mockCampaignRepo.countActiveCampaignsForAgent).toHaveBeenCalledWith(
        "agent-1",
        "camp-resume",
      );
      // Upstream client should never have been invoked
      expect(mockSarvamClient.updateStatus).not.toHaveBeenCalled();
      expect(mockCampaignRepo.updateSarvamStatus).not.toHaveBeenCalled();
    });

    it("allows idempotent resume when campaign is already RUNNING without checking or throwing capacity error", async () => {
      mockCampaignRepo.findById!.mockResolvedValue({
        id: "camp-already-running",
        tenantId: "tenant-1",
        provider: "SARVAM",
        sarvamCampaignId: "srv-camp-running",
        sarvamAgentId: "agent-1",
        status: "RUNNING",
      } as any);

      mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
        id: "agent-1",
        name: "Sales Support Agent",
        apiKey: {
          organizationId: "org-1",
          workspaceId: "ws-1",
          apiKeyEncrypted: "encrypted-key",
        },
      } as any);

      // Even if count returns 5
      mockCampaignRepo.countActiveCampaignsForAgent.mockResolvedValue(5);

      mockSarvamClient.updateStatus!.mockResolvedValue({
        campaign_id: "srv-camp-running",
        name: "Campaign Already Running",
        status: "active",
        app_id: "agent-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockCampaignRepo.updateSarvamStatus!.mockResolvedValue({
        id: "camp-already-running",
        status: "RUNNING",
        sarvamStatus: "active",
      } as any);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-already-running",
        action: "resume",
      });

      expect(result.status).toBe("RUNNING");
      expect(mockCampaignRepo.countActiveCampaignsForAgent).not.toHaveBeenCalled();
      expect(mockSarvamClient.updateStatus).toHaveBeenCalledWith(
        "org-1",
        "ws-1",
        "srv-camp-running",
        "decrypted-api-key",
        "resume",
      );
    });

    it("allows resume when agent has 4 running campaigns (under limit)", async () => {
      mockCampaignRepo.findById!.mockResolvedValue({
        id: "camp-resume-ok",
        tenantId: "tenant-1",
        provider: "SARVAM",
        sarvamCampaignId: "srv-camp-resume-ok",
        sarvamAgentId: "agent-1",
        status: "PAUSED",
      } as any);

      mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
        id: "agent-1",
        name: "Sales Support Agent",
        apiKey: {
          organizationId: "org-1",
          workspaceId: "ws-1",
          apiKeyEncrypted: "encrypted-key",
        },
      } as any);

      mockCampaignRepo.countActiveCampaignsForAgent.mockResolvedValue(4);

      mockSarvamClient.updateStatus!.mockResolvedValue({
        campaign_id: "srv-camp-resume-ok",
        name: "Campaign Resume OK",
        status: "active",
        app_id: "agent-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockCampaignRepo.updateSarvamStatus!.mockResolvedValue({
        id: "camp-resume-ok",
        status: "RUNNING",
        sarvamStatus: "active",
      } as any);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-resume-ok",
        action: "resume",
      });

      expect(result.status).toBe("RUNNING");
      expect(mockCampaignRepo.countActiveCampaignsForAgent).toHaveBeenCalledWith(
        "agent-1",
        "camp-resume-ok",
      );
      expect(mockSarvamClient.updateStatus).toHaveBeenCalledWith(
        "org-1",
        "ws-1",
        "srv-camp-resume-ok",
        "decrypted-api-key",
        "resume",
      );
    });
  });
});
