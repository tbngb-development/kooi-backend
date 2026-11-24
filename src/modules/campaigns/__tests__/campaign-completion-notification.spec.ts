import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignEntityData } from "../domain/entities/campaign.entity";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../batches/application/interfaces/batch-repository.interface";
import type { CampaignNotifications } from "../application/services/campaign-notifications";
import type {
  CampaignStatusReconciliationPort,
} from "../application/services/campaign-status-reconciler.service";
import type { ISarvamCampaignClient } from "../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { Logger } from "../../../shared/logging/logger.interface";
import { UpdateCampaignStatusUseCase } from "../application/use-cases/update-campaign-status.use-case";
import { SyncSarvamCampaignLifecycleUseCase } from "../application/use-cases/sync-sarvam-campaign-lifecycle.use-case";
import { CampaignStatusReconciler } from "../application/services/campaign-status-reconciler.service";

const completedAt = new Date("2026-11-17T12:00:00.000Z");

function campaign(overrides: Partial<CampaignEntityData> = {}): CampaignEntityData {
  return {
    id: "camp-1",
    name: "Winter Sale 2026",
    description: null,
    status: "RUNNING",
    tenantId: "tenant-1",
    assistantId: "asst-1",
    sarvamAgentId: null,
    provider: "BOLNA",
    sarvamCampaignId: null,
    sarvamStatus: null,
    startTimestamp: null,
    endTimestamp: null,
    allowedSchedule: null,
    variables: {},
    defaultRetryConfig: null,
    totalLeads: 100,
    calledLeads: 95,
    completedLeads: 80,
    failedLeads: 15,
    startedAt: new Date("2026-11-17T10:00:00.000Z"),
    completedAt: null,
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
    updatedAt: new Date("2026-11-17T12:00:00.000Z"),
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

function notificationsDouble() {
  return {
    publishCreated: vi.fn().mockResolvedValue(undefined),
    publishCompleted: vi.fn().mockResolvedValue(undefined),
  } as unknown as CampaignNotifications;
}

describe("UpdateCampaignStatusUseCase — campaign.completed notification", () => {
  let campaignRepo: CampaignRepository;
  let batchRepo: BatchRepository;
  let logger: Logger;
  let notifications: CampaignNotifications;
  let useCase: UpdateCampaignStatusUseCase;

  beforeEach(() => {
    campaignRepo = {
      findById: vi.fn().mockResolvedValue(campaign()),
      updateStatus: vi.fn().mockResolvedValue(
        campaign({ status: "COMPLETED", completedAt }),
      ),
    } as unknown as CampaignRepository;
    batchRepo = {
      cascadeStatusFromCampaign: vi.fn().mockResolvedValue(0),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
    } as unknown as BatchRepository;
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;
    notifications = notificationsDouble();
    useCase = new UpdateCampaignStatusUseCase(
      campaignRepo,
      batchRepo,
      logger,
      notifications,
    );
  });

  it("publishes campaign.completed when a campaign reaches COMPLETED", async () => {
    await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      status: "COMPLETED",
    });

    expect(notifications.publishCompleted).toHaveBeenCalledWith(
      "camp-1",
      completedAt,
    );
  });

  it("does not publish for non-completion status changes", async () => {
    vi.mocked(campaignRepo.updateStatus).mockResolvedValueOnce(
      campaign({ status: "RUNNING" }),
    );

    await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      status: "RUNNING",
    });

    expect(notifications.publishCompleted).not.toHaveBeenCalled();
  });

  it("does not republish for a campaign that is already COMPLETED", async () => {
    vi.mocked(campaignRepo.findById).mockResolvedValueOnce(
      campaign({ status: "COMPLETED" }),
    );

    await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      status: "COMPLETED",
    });

    expect(notifications.publishCompleted).not.toHaveBeenCalled();
  });
});

describe("SyncSarvamCampaignLifecycleUseCase — campaign.completed notification", () => {
  it("publishes campaign.completed when a Sarvam campaign sync settles", async () => {
    const campaignRepo = {
      findActiveSarvamCampaigns: vi.fn().mockResolvedValue([
        {
          id: "camp-1",
          tenantId: "tenant-1",
          sarvamCampaignId: "srv-camp-1",
          sarvamAgentId: "agent-1",
          status: "RUNNING",
          sarvamStatus: "active",
        },
      ]),
      findSarvamAgentWithApiKey: vi.fn().mockResolvedValue({
        apiKey: {
          organizationId: "org-1",
          workspaceId: "ws-1",
          apiKeyEncrypted: "encrypted-key",
        },
      }),
      updateSarvamStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as CampaignRepository;
    const batchRepo = {
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
    } as unknown as BatchRepository;
    const sarvamClient = {
      getCampaign: vi.fn().mockResolvedValue({ status: "ended" }),
    } as unknown as ISarvamCampaignClient;
    const encryption = {
      decrypt: vi.fn().mockReturnValue("decrypted-key"),
    } as unknown as ISarvamApiKeyEncryptionService;
    const notifications = notificationsDouble();

    const useCase = new SyncSarvamCampaignLifecycleUseCase(
      campaignRepo,
      batchRepo,
      sarvamClient,
      encryption,
      undefined,
      notifications,
    );

    await useCase.execute();

    expect(notifications.publishCompleted).toHaveBeenCalledWith(
      "camp-1",
      expect.any(Date),
    );
  });
});

describe("CampaignStatusReconciler — campaign.completed notification", () => {
  function port(
    statuses: string[] = ["COMPLETED"],
    settled = true,
  ): CampaignStatusReconciliationPort {
    return {
      getAllBatchStatuses: vi.fn().mockResolvedValue(statuses),
      markCampaignRunningIfActive: vi.fn().mockResolvedValue(true),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
      settleCampaignIfActive: vi.fn().mockResolvedValue(settled),
    } as unknown as CampaignStatusReconciliationPort;
  }

  it("publishes campaign.completed when the atomic guard settles a campaign", async () => {
    const notifications = notificationsDouble();
    const reconciler = new CampaignStatusReconciler(
      port(),
      undefined,
      notifications,
    );

    await reconciler.reconcile("camp-1");

    expect(notifications.publishCompleted).toHaveBeenCalledWith(
      "camp-1",
      expect.any(Date),
    );
  });

  it("does not publish when the atomic guard rejects finalization", async () => {
    const notifications = notificationsDouble();
    const reconciler = new CampaignStatusReconciler(
      port(["COMPLETED"], false),
      undefined,
      notifications,
    );

    await reconciler.reconcile("camp-1");

    expect(notifications.publishCompleted).not.toHaveBeenCalled();
  });

  it("does not publish a failed settlement as a completion", async () => {
    const notifications = notificationsDouble();
    const reconciler = new CampaignStatusReconciler(
      port(["FAILED"]),
      undefined,
      notifications,
    );

    await reconciler.reconcile("camp-1");

    expect(notifications.publishCompleted).not.toHaveBeenCalled();
  });

  it("publishes via the fallback update path when no atomic guard is available", async () => {
    const fallbackPort = port();
    delete fallbackPort.settleCampaignIfActive;
    const notifications = notificationsDouble();
    const reconciler = new CampaignStatusReconciler(
      fallbackPort,
      undefined,
      notifications,
    );

    await reconciler.reconcile("camp-1");

    expect(notifications.publishCompleted).toHaveBeenCalledWith(
      "camp-1",
      expect.any(Date),
    );
  });
});
