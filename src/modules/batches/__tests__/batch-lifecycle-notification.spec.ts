import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../../shared/logging/logger.interface";
import type {
  DiscordEvent,
  IDiscordEventsPublisher,
} from "../../../shared/config/external/notifications/discordevents-publisher";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";
import type { IPhoneNumberRepository } from "../../phone-numbers/application/interfaces/phone-number-repository.interface";
import type { ISarvamCohortClient } from "../application/interfaces/sarvam-cohort-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import type { TenantNameRepository } from "../application/interfaces/tenant-name-repository.interface";
import { BatchProcessingWorker } from "../infrastructure/jobs/batch-processing.worker";

vi.mock("axios");
vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

const tenantId = "tenant-1";
const campaignId = "camp-1";
const batchId = "batch-1";
const batchName = "BTH001-winter-sale-2026-lb_batch-1";
const rawFileUrl = "https://storage.example.com/raw.csv";
const csvWithLeads =
  "Contact Number,Customer Name\n+919876543210,Aarav Sharma\n+919876543211,Diya Verma";
const dashboardPath = `/campaigns/${campaignId}/batches`;

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      batchId,
      tenantId,
      campaignId,
      rawFileUrl,
      fileName: "leads.csv",
      scheduledAt: null,
      runImmediately: false,
      retryConfig: null,
      termsVersion: "1.0",
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    ...overrides,
  } as any;
}

describe("BatchProcessingWorker lifecycle notifications", () => {
  let batchRepo: BatchRepository;
  let campaignRepo: CampaignRepository;
  let planRepo: PlanRepository;
  let bolnaProvider: BolnaBatchProvider;
  let phoneNumberRepo: IPhoneNumberRepository;
  let storage: FileStorageProvider;
  let tenantNameRepo: TenantNameRepository;
  let publisher: IDiscordEventsPublisher;

  const existingBatch = {
    id: batchId,
    tenantId,
    campaignId,
    name: batchName,
    fileName: "leads.csv",
    provider: "BOLNA",
    status: "PROCESSING",
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
  } as any;

  const bolnaCampaign = {
    id: campaignId,
    tenantId,
    name: "Winter Sale 2026",
    provider: "BOLNA",
    status: "SCHEDULED",
    variables: {},
    assistant: { platformAgent: { bolnaId: "agent-bolna-1" } },
  } as any;

  const pendingLeads = [
    {
      id: "lead-1",
      name: "Aarav Sharma",
      phone: "+919876543210",
      email: null,
      company: null,
      metadata: {},
    },
    {
      id: "lead-2",
      name: "Diya Verma",
      phone: "+919876543211",
      email: null,
      company: null,
      metadata: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    batchRepo = {
      findById: vi.fn().mockResolvedValue(existingBatch),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      findExistingPhones: vi.fn().mockResolvedValue([]),
      createLeads: vi.fn().mockResolvedValue(2),
      reassignCampaignLeadsToBatch: vi.fn().mockResolvedValue(undefined),
      findPendingLeads: vi.fn().mockResolvedValue(pendingLeads),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(existingBatch),
      updateProcessingError: vi.fn().mockResolvedValue(undefined),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
    } as unknown as BatchRepository;

    campaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue(bolnaCampaign),
      hasLowBalanceStoppedLeads: vi.fn().mockResolvedValue(false),
      reopenCampaignForNewBatch: vi.fn().mockResolvedValue(true),
      updateStatus: vi.fn().mockResolvedValue({}),
    } as unknown as CampaignRepository;

    planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        id: "plan-1",
        status: "ACTIVE",
        isTrial: false,
        maxLeadsPerBatch: null,
      }),
    } as unknown as PlanRepository;

    bolnaProvider = {
      createBatch: vi.fn().mockResolvedValue({ batch_id: "bolna-batch-1" }),
      scheduleBatch: vi.fn().mockResolvedValue({ state: "scheduled" }),
    } as unknown as BolnaBatchProvider;

    phoneNumberRepo = {
      findOutboundPhoneNumbers: vi.fn().mockResolvedValue([]),
    } as unknown as IPhoneNumberRepository;

    storage = {
      uploadBuffer: vi
        .fn()
        .mockResolvedValue("https://storage.example.com/transformed.csv"),
    } as unknown as FileStorageProvider;

    tenantNameRepo = {
      getNameById: vi.fn().mockResolvedValue("Acme Motors"),
    } as TenantNameRepository;

    publisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as IDiscordEventsPublisher;

    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.from(csvWithLeads, "utf-8"),
    });
  });

  function makeBolnaWorker() {
    return new BatchProcessingWorker(
      batchRepo,
      campaignRepo,
      planRepo,
      bolnaProvider,
      phoneNumberRepo,
      undefined,
      undefined,
      storage,
      makeLogger(),
      tenantNameRepo,
      publisher,
    );
  }

  function publishedEvent(): DiscordEvent {
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    return vi.mocked(publisher.publish).mock.calls[0][0];
  }

  it("publishes batch.completed after Bolna finalization", async () => {
    await makeBolnaWorker().process(makeJob());

    expect(publishedEvent()).toMatchObject({
      eventId: "batch.completed:batch-1:processed",
      eventType: "batch.completed",
      eventVersion: 1,
      tenantId,
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId,
        campaignId,
        campaignName: "Winter Sale 2026",
        batchId,
        batchName,
        provider: "BOLNA",
        totalLeads: 2,
        validLeads: 2,
        invalidLeads: 0,
        finalStatus: "CREATED",
        dashboardPath,
      },
    });

    const serialized = JSON.stringify(publishedEvent().data);
    expect(serialized).not.toContain("+919876543210");
    expect(serialized).not.toContain(rawFileUrl);
  });

  it("publishes batch.failed with the friendly failure reason for an empty file", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: Buffer.from("Contact Number\n", "utf-8"),
    });

    await makeBolnaWorker().process(makeJob());

    expect(publishedEvent()).toMatchObject({
      eventId: "batch.failed:batch-1:processing",
      eventType: "batch.failed",
      eventVersion: 1,
      tenantId,
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId,
        campaignId,
        campaignName: "Winter Sale 2026",
        batchId,
        batchName,
        provider: "BOLNA",
        failureReason:
          "The uploaded file appears to be empty. Please upload a CSV file with lead data.",
        dashboardPath,
      },
    });

    const serialized = JSON.stringify(publishedEvent().data);
    expect(serialized).not.toContain(rawFileUrl);
    expect(serialized).not.toContain("ECONNREFUSED");
  });

  it("publishes batch.failed on the final Bull attempt", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(
      new Error("ECONNREFUSED downloading raw file"),
    );

    await expect(
      makeBolnaWorker().process(
        makeJob({ attemptsMade: 2, opts: { attempts: 3 } }),
      ),
    ).rejects.toThrow("ECONNREFUSED");

    expect(publishedEvent()).toMatchObject({
      eventType: "batch.failed",
      data: {
        failureReason:
          "We couldn't connect to the calling service. Your batch will be retried automatically. If the issue persists, please contact support.",
      },
    });
    expect(JSON.stringify(publishedEvent().data)).not.toContain("ECONNREFUSED");
  });

  it("publishes batch.completed after Sarvam finalization", async () => {
    const sarvamCampaign = {
      ...bolnaCampaign,
      provider: "SARVAM",
      sarvamAgentId: "agent-sarvam-1",
      sarvamCampaignId: "sarvam-camp-1",
    } as any;
    vi.mocked(campaignRepo.findByIdWithRelations).mockResolvedValue(
      sarvamCampaign,
    );
    vi.mocked(campaignRepo).countActiveCampaignsForAgent = vi
      .fn()
      .mockResolvedValue(0) as any;

    const sarvamClient = {
      uploadCohort: vi.fn().mockResolvedValue({
        cohort_id: "cohort-1",
        status: "completed",
      }),
      getCohort: vi.fn(),
    } as unknown as ISarvamCohortClient;
    const sarvamEncryption = {
      decrypt: vi.fn().mockReturnValue("decrypted-key"),
    } as unknown as ISarvamApiKeyEncryptionService;
    vi.mocked(campaignRepo).findSarvamAgentWithApiKey = vi
      .fn()
      .mockResolvedValue({
        id: "agent-sarvam-1",
        agentVariables: [
          {
            key: "customer_name",
            defaultValue: "",
            isTenantVisible: true,
            isTenantEditable: true,
          },
        ],
        apiKey: {
          organizationId: "org-1",
          workspaceId: "ws-1",
          apiKeyEncrypted: "encrypted-key",
        },
        overrides: [],
      }) as any;

    const worker = new BatchProcessingWorker(
      batchRepo,
      campaignRepo,
      planRepo,
      bolnaProvider,
      phoneNumberRepo,
      sarvamClient,
      sarvamEncryption,
      storage,
      makeLogger(),
      tenantNameRepo,
      publisher,
    );

    await worker.process(makeJob());

    expect(publishedEvent()).toMatchObject({
      eventId: "batch.completed:batch-1:processed",
      eventType: "batch.completed",
      data: {
        tenantName: "Acme Motors",
        campaignName: "Winter Sale 2026",
        batchName,
        provider: "SARVAM",
        totalLeads: 2,
        validLeads: 2,
        invalidLeads: 0,
        finalStatus: "CREATED",
        dashboardPath,
      },
    });
  });

  it("does not fail batch processing when notification publishing rejects", async () => {
    vi.mocked(publisher.publish).mockRejectedValueOnce(
      new Error("notification service down"),
    );

    await expect(makeBolnaWorker().process(makeJob())).resolves.toBeUndefined();

    expect(batchRepo.update).toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it("reopens a completed Bolna campaign when a new batch runs immediately", async () => {
    vi.mocked(campaignRepo.findByIdWithRelations).mockResolvedValue({
      ...bolnaCampaign,
      status: "COMPLETED",
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
    } as any);

    const job = makeJob();
    job.data.runImmediately = true;

    await makeBolnaWorker().process(job);

    expect(batchRepo.update).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({ status: "RUNNING" }),
    );
    expect(campaignRepo.reopenCampaignForNewBatch).toHaveBeenCalledWith(
      campaignId,
      { startedAt: null },
    );
    expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
  });

  it("aborts new batch work before provider calls for a credit-enforcement-stopped campaign", async () => {
    vi.mocked(campaignRepo.findByIdWithRelations).mockResolvedValue({
      ...bolnaCampaign,
      status: "COMPLETED",
    } as any);
    vi.mocked(campaignRepo.hasLowBalanceStoppedLeads).mockResolvedValueOnce(
      true,
    );

    await makeBolnaWorker().process(makeJob());

    expect(campaignRepo.hasLowBalanceStoppedLeads).toHaveBeenCalledWith(
      campaignId,
    );
    expect(bolnaProvider.createBatch).not.toHaveBeenCalled();
    expect(bolnaProvider.scheduleBatch).not.toHaveBeenCalled();
    expect(campaignRepo.reopenCampaignForNewBatch).not.toHaveBeenCalled();
    expect(batchRepo.updateProcessingError).toHaveBeenCalled();
    expect(publishedEvent()).toMatchObject({ eventType: "batch.failed" });
  });
});
