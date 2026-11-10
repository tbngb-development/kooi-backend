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

  it("reconciles expired Sarvam campaign: marks campaign COMPLETED, unfinished batches STOPPED, and uncalled leads STOPPED", async () => {
    const expiredCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-expired-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-exp-1",
      sarvamAgentId: "agent-1",
      status: "RUNNING",
      sarvamStatus: "active",
      endTimestamp: new Date(Date.now() - 3600000), // 1 hour ago
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([expiredCampaign]);
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
      campaign_id: "srv-camp-exp-1",
      name: "Expired Campaign",
      status: "active", // Remote still says active
      app_id: "app-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockBatchRepo.list = vi.fn().mockResolvedValue([
      { id: "batch-running", status: "RUNNING" },
      { id: "batch-completed", status: "COMPLETED" },
    ]);
    mockBatchRepo.markPendingLeadsAsStopped = vi.fn().mockResolvedValue(5);
    mockBatchRepo.cascadeStatusFromCampaign = vi.fn().mockResolvedValue(1);

    const result = await useCase.execute();

    expect(result.updatedCount).toBe(1);
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-expired-1",
      "active",
      "COMPLETED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
    // Unfinished batch has pending leads stopped
    expect(mockBatchRepo.markPendingLeadsAsStopped).toHaveBeenCalledWith(
      "batch-running",
      "MANUAL",
    );
    // Completed batch is NOT stopped
    expect(mockBatchRepo.markPendingLeadsAsStopped).not.toHaveBeenCalledWith(
      "batch-completed",
      "MANUAL",
    );
    // Unfinished batches cascaded to STOPPED (never falsely COMPLETED)
    expect(mockBatchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
      "camp-expired-1",
      "STOPPED",
    );
    expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith("camp-expired-1");
  });

  it("proceeds with local expiration even if Sarvam agent credentials are missing", async () => {
    const expiredCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-expired-no-creds",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-exp-2",
      sarvamAgentId: "agent-missing",
      status: "RUNNING",
      sarvamStatus: "active",
      endTimestamp: new Date(Date.now() - 5000),
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([expiredCampaign]);
    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue(null);

    mockBatchRepo.list = vi.fn().mockResolvedValue([]);
    mockBatchRepo.recalculateCampaignStats = vi.fn().mockResolvedValue(undefined);

    const result = await useCase.execute();

    expect(result.updatedCount).toBe(1);
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-expired-no-creds",
      "active",
      "COMPLETED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
  });

  it("reconciles expired PAUSED campaign: marks campaign COMPLETED and stops active batches", async () => {
    const expiredPausedCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-paused-expired",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-paused-1",
      sarvamAgentId: "agent-1",
      status: "PAUSED",
      sarvamStatus: "paused",
      endTimestamp: new Date(Date.now() - 10000),
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([expiredPausedCampaign]);
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
      campaign_id: "srv-camp-paused-1",
      name: "Paused Expired",
      status: "paused",
      app_id: "app-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockBatchRepo.list = vi.fn().mockResolvedValue([
      { id: "batch-paused-1", status: "CREATED" },
    ]);
    mockBatchRepo.markPendingLeadsAsStopped = vi.fn().mockResolvedValue(10);
    mockBatchRepo.cascadeStatusFromCampaign = vi.fn().mockResolvedValue(1);

    const result = await useCase.execute();

    expect(result.updatedCount).toBe(1);
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-paused-expired",
      "paused",
      "COMPLETED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
    expect(mockBatchRepo.markPendingLeadsAsStopped).toHaveBeenCalledWith(
      "batch-paused-1",
      "MANUAL",
    );
    expect(mockBatchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
      "camp-paused-expired",
      "STOPPED",
    );
  });

  it("reconciles expired SCHEDULED campaign: marks campaign COMPLETED and stops active batches", async () => {
    const expiredScheduledCampaign: ActiveSarvamCampaignRecord = {
      id: "camp-scheduled-expired",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-sched-1",
      sarvamAgentId: "agent-1",
      status: "SCHEDULED",
      sarvamStatus: "active",
      endTimestamp: new Date(Date.now() - 20000),
    };

    mockCampaignRepo.findActiveSarvamCampaigns!.mockResolvedValue([expiredScheduledCampaign]);
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
      campaign_id: "srv-camp-sched-1",
      name: "Scheduled Expired",
      status: "active",
      app_id: "app-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockBatchRepo.list = vi.fn().mockResolvedValue([
      { id: "batch-sched-1", status: "SCHEDULED" },
    ]);
    mockBatchRepo.markPendingLeadsAsStopped = vi.fn().mockResolvedValue(4);
    mockBatchRepo.cascadeStatusFromCampaign = vi.fn().mockResolvedValue(1);

    const result = await useCase.execute();

    expect(result.updatedCount).toBe(1);
    expect(mockCampaignRepo.updateSarvamStatus).toHaveBeenCalledWith(
      "camp-scheduled-expired",
      "active",
      "COMPLETED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
    expect(mockBatchRepo.markPendingLeadsAsStopped).toHaveBeenCalledWith(
      "batch-sched-1",
      "MANUAL",
    );
    expect(mockBatchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
      "camp-scheduled-expired",
      "STOPPED",
    );
  });
});
