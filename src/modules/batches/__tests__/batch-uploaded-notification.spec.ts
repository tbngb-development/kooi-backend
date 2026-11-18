import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../../shared/logging/logger.interface";
import type {
  IDiscordEventsPublisher,
  DiscordEvent,
} from "../../../shared/config/external/notifications/discordevents-publisher";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import type { TenantNameRepository } from "../application/interfaces/tenant-name-repository.interface";
import { EnqueueBatchUploadUseCase } from "../application/use-cases/enqueue-batch-upload.use-case";

vi.mock("../../../../shared/config/external/queue/queue.factory", () => ({
  getQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    getJobs: vi.fn().mockResolvedValue([]),
  }),
}));

describe("EnqueueBatchUploadUseCase — batch.uploaded notification", () => {
  let batchRepo: BatchRepository;
  let campaignRepo: CampaignRepository;
  let planRepo: PlanRepository;
  let storage: FileStorageProvider;
  let tenantNameRepo: TenantNameRepository;
  let publisher: IDiscordEventsPublisher;
  let logger: Logger;
  let useCase: EnqueueBatchUploadUseCase;

  const input = {
    tenantId: "tenant-1",
    campaignId: "camp-1",
    fileBuffer: Buffer.from("Contact Number\n9876543210"),
    fileName: "leads.csv",
    termsAccepted: true,
    termsVersion: "1.0",
    runImmediately: true,
  };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    batchRepo = {
      create: vi.fn().mockResolvedValue({
        id: "batch-1",
        status: "PROCESSING",
        createdAt: new Date("2026-11-17T10:00:00.000Z"),
      }),
      updateRawFileUrl: vi.fn().mockResolvedValue(undefined),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue({ id: "batch-1", status: "PROCESSING" }),
    } as unknown as BatchRepository;

    campaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: "camp-1",
        tenantId: "tenant-1",
        provider: "BOLNA",
        status: "RUNNING",
        name: "Winter Sale 2026",
        assistant: { id: "asst-1" },
      }),
      updateStatus: vi.fn().mockResolvedValue({ id: "camp-1" }),
    } as unknown as CampaignRepository;

    planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        id: "plan-1",
        status: "ACTIVE",
        isTrial: false,
        maxActiveCampaigns: 5,
      }),
      countRunningCampaigns: vi.fn().mockResolvedValue(0),
    } as unknown as PlanRepository;

    storage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.example.com/raw.csv"),
    } as unknown as FileStorageProvider;

    tenantNameRepo = {
      getNameById: vi.fn().mockResolvedValue("Acme Motors"),
    } as TenantNameRepository;

    publisher = { publish: vi.fn().mockResolvedValue(undefined) } as IDiscordEventsPublisher;

    useCase = new EnqueueBatchUploadUseCase(
      batchRepo,
      campaignRepo,
      planRepo,
      storage,
      logger,
      tenantNameRepo,
      publisher,
    );
  });

  function publishedEvent(): DiscordEvent {
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    return vi.mocked(publisher.publish).mock.calls[0][0];
  }

  it("publishes a versioned batch.uploaded envelope on a successful upload", async () => {
    const result = await useCase.execute(input);

    expect(result.status).toBe("PROCESSING");
    expect(publishedEvent()).toMatchObject({
      eventId: "batch.uploaded:batch-1:created",
      eventType: "batch.uploaded",
      eventVersion: 1,
      occurredAt: "2026-11-17T10:00:00.000Z",
      tenantId: "tenant-1",
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId: "tenant-1",
        campaignId: "camp-1",
        campaignName: "Winter Sale 2026",
        batchId: "batch-1",
        batchName: "BTH001-winter-sale-2026-lb_batch1",
        status: "PROCESSING",
        provider: "BOLNA",
        dashboardPath: "/campaigns/camp-1/batches",
      },
    });
  });

  it("does not publish when upload validation fails", async () => {
    await expect(
      useCase.execute({ ...input, fileBuffer: Buffer.alloc(0) }),
    ).rejects.toThrow();

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("falls back to tenantId when the tenant name is missing", async () => {
    vi.mocked(tenantNameRepo.getNameById).mockResolvedValueOnce(null);

    await useCase.execute(input);

    expect(publishedEvent().data.tenantName).toBe("tenant-1");
  });

  it("never includes sensitive fields in the event data", async () => {
    await useCase.execute(input);

    const serialized = JSON.stringify(publishedEvent().data);
    expect(serialized).not.toMatch(
      /phone|transcript|recording|csvContent|csvRows|rawFileUrl|fileUrl|cloudinary|https?:\/\//i,
    );
    expect(serialized).not.toContain("9876543210");
  });

  it("does not fail the upload when publishing throws", async () => {
    vi.mocked(publisher.publish).mockRejectedValueOnce(new Error("service down"));

    await expect(useCase.execute(input)).resolves.toMatchObject({
      status: "PROCESSING",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "failed to publish batch.uploaded event",
      expect.anything(),
      expect.objectContaining({
        action: "notification.publish_failed",
        batchId: "batch-1",
      }),
    );
  });
});
