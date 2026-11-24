import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessBatchWebhookUseCase } from "../application/use-cases/process-batch-webhook.use-case";
import type { WebhookRepository } from "../application/interfaces/webhook-repository.interface";

describe("ProcessBatchWebhookUseCase new-batch lifecycle regressions", () => {
  let repo: WebhookRepository;
  let useCase: ProcessBatchWebhookUseCase;

  beforeEach(() => {
    repo = {
      findBatchIdByBolnaBatchId: vi.fn().mockResolvedValue({
        id: "batch-old",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
        scheduledAt: null,
      }),
      getAllBatchStatuses: vi.fn().mockResolvedValue([]),
      updateBatchStatus: vi.fn().mockResolvedValue(undefined),
      stopBatchCallsAndLeads: vi.fn().mockResolvedValue({
        stoppedCalls: 0,
        stoppedLeads: 0,
      }),
      markCampaignRunningIfActive: vi.fn().mockResolvedValue(true),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
      settleCampaignIfActive: vi.fn().mockResolvedValue(true),
    } as unknown as WebhookRepository;

    useCase = new ProcessBatchWebhookUseCase(repo);
  });

  it("keeps a reopened campaign RUNNING when an old batch completion arrives during new work", async () => {
    vi.mocked(repo.getAllBatchStatuses).mockResolvedValue([
      "CREATED",
      "COMPLETED",
    ]);

    await useCase.execute({ batch_id: "bolna-batch-old", state: "completed" });

    expect(repo.updateBatchStatus).toHaveBeenCalledWith(
      "batch-old",
      "COMPLETED",
      expect.any(Date),
    );
    expect(repo.markCampaignRunningIfActive).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Date),
    );
    expect(repo.settleCampaignIfActive).not.toHaveBeenCalled();
  });

  it("settles only after the final in-flight batch completes", async () => {
    vi.mocked(repo.getAllBatchStatuses).mockResolvedValue([
      "COMPLETED",
      "COMPLETED",
    ]);

    await useCase.execute({ batch_id: "bolna-batch-old", state: "completed" });

    expect(repo.settleCampaignIfActive).toHaveBeenCalledWith(
      "campaign-1",
      "COMPLETED",
      expect.any(Date),
    );
    expect(repo.markCampaignRunningIfActive).not.toHaveBeenCalled();
  });

  it("does not fall back to an unguarded write when a late finalize is rejected", async () => {
    vi.mocked(repo.getAllBatchStatuses).mockResolvedValue([
      "COMPLETED",
      "COMPLETED",
    ]);
    vi.mocked(repo.settleCampaignIfActive as NonNullable<
      WebhookRepository["settleCampaignIfActive"]
    >).mockResolvedValue(false);

    await useCase.execute({ batch_id: "bolna-batch-old", state: "completed" });

    expect(repo.settleCampaignIfActive).toHaveBeenCalled();
    expect(repo.updateCampaignStatus).not.toHaveBeenCalled();
  });
});
