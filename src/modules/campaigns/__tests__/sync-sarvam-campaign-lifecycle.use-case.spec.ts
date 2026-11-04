import { describe, it, expect, vi, beforeEach } from "vitest";
// modules/campaigns/__tests__/sync-sarvam-campaign-lifecycle.use-case.spec.ts

import { SyncSarvamCampaignLifecycleUseCase } from "../application/use-cases/sync-sarvam-campaign-lifecycle.use-case";
import type { CampaignRepository, ActiveSarvamCampaignRecord } from "../application/interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../batches/application/interfaces/batch-repository.interface";
import type { ISarvamCampaignClient } from "../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";

describe("SyncSarvamCampaignLifecycleUseCase", () => {
  let useCase: SyncSarvamCampaignLifecycleUseCase;
  let mockCampaignRepo: any;
  let mockBatchRepo: any;
  let mockSarvamClient: any;
  let mockEncryptionService: any;

  beforeEach(() => {
    mockCampaignRepo = {
      findActiveSarvamCampaigns: vi.fn(),
      findSarvamAgentWithApiKey: vi.fn(),
      updateSarvamStatus: vi.fn(),
    };

    mockBatchRepo = {
      recalculateCampaignStats: vi.fn(),
    };

    mockSarvamClient = {
      getCampaign: vi.fn(),
    };

    mockEncryptionService = {
      encrypt: vi.fn(),
      decrypt: vi.fn().mockReturnValue("decrypted-api-key"),
    };

    useCase = new SyncSarvamCampaignLifecycleUseCase(
      mockCampaignRepo as unknown as CampaignRepository,
      mockBatchRepo as unknown as BatchRepository,
      mockSarvamClient as unknown as ISarvamCampaignClient,
      mockEncryptionService,
    );
  });

  it("returns zero counts when there are no active Sarvam campaigns", async () => {
    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({ syncedCount: 0, updatedCount: 0, errors: [] });
    expect(mockSarvamClient.getCampaign).not.toHaveBeenCalled();
  });

  it("skips campaigns with missing agent credentials", async () => {
    const activeCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
      sarvamStatus: "active",
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([activeCampaign]);
    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(mockSarvamClient.getCampaign).not.toHaveBeenCalled();
  });

  it("synchronizes status change from active to ended and sets completedAt", async () => {
    const activeCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
      sarvamStatus: "active",
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([activeCampaign]);
    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
      appId: "app-1",
      apiKey: {
        id: "key-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.getCampaign!.mockResolvedValue({
      campaign_id: "srv-camp-1",
      name: "Test Campaign",
      status: "ended",
      app_id: "app-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-1",
      "ended",
      "COMPLETED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
    expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith("camp-1");
  });

  it("synchronizes status change from active to paused", async () => {
    const activeCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
      sarvamStatus: "active",
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([activeCampaign]);
    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
      appId: "app-1",
      apiKey: {
        id: "key-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.getCampaign!.mockResolvedValue({
      campaign_id: "srv-camp-1",
      name: "Test Campaign",
      status: "paused",
      app_id: "app-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-1",
      "paused",
      "PAUSED",
      undefined,
    );
    expect(mockBatchRepo.recalculateCampaignStats).not.toHaveBeenCalled();
  });

  it("does not update if remote status is unchanged", async () => {
    const activeCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
      sarvamStatus: "active",
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([activeCampaign]);
    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
      appId: "app-1",
      apiKey: {
        id: "key-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.getCampaign!.mockResolvedValue({
      campaign_id: "srv-camp-1",
      name: "Test Campaign",
      status: "active",
      app_id: "app-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(mockCampaignRepo.updateSarvamStatus).not.toHaveBeenCalled();
  });

  it("catches error on individual campaign failure without crashing entire sync", async () => {
    const campaign1: ActiveSarvamCampaignRecord = {
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
      sarvamStatus: "active",
    };
    const campaign2: ActiveSarvamCampaignRecord = {
      id: "camp-2",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-2",
      sarvamAgentId: "agent-1",
      status: "PAUSED",
      sarvamStatus: "paused",
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([campaign1, campaign2]);
    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
      appId: "app-1",
      apiKey: {
        id: "key-1",
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockSarvamClient.getCampaign!
      .mockRejectedValueOnce(new Error("Sarvam 500 Network Error"))
      .mockResolvedValueOnce({
        campaign_id: "srv-camp-2",
        name: "Campaign 2",
        status: "active",
        app_id: "app-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(2);
    expect(result.updatedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({
      campaignId: "camp-1",
      error: "Sarvam 500 Network Error",
    });
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-2",
      "active",
      "RUNNING",
      undefined,
    );
  });
});
