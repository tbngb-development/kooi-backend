import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunBatchUseCase } from "../application/use-cases/run-batch.use-case";
import { ScheduleBatchUseCase } from "../application/use-cases/schedule-batch.use-case";
import { CampaignStoppedForLowBalanceError } from "../../campaigns/domain/errors/campaign.errors";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";

vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

describe("explicit batch start reopens normal terminal campaigns", () => {
  const tenantId = "tenant-1";
  const campaignId = "campaign-1";
  const batchId = "batch-1";

  let batchRepo: any;
  let campaignRepo: any;
  let planRepo: any;
  let bolnaProvider: any;
  let runUseCase: RunBatchUseCase;
  let scheduleUseCase: ScheduleBatchUseCase;

  beforeEach(() => {
    batchRepo = {
      findById: vi.fn().mockResolvedValue({
        id: batchId,
        status: "CREATED",
        bolnaBatchId: "bolna-batch-1",
        totalLeads: 10,
      }),
      update: vi.fn().mockImplementation(async (_id: string, data: unknown) => ({
        id: batchId,
        ...(data as object),
      })),
    };

    campaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        status: "COMPLETED",
        provider: "BOLNA",
        startedAt: null,
        assistant: { id: "assistant-1" },
      }),
      hasLowBalanceStoppedLeads: vi.fn().mockResolvedValue(false),
      reopenCampaignForNewBatch: vi.fn().mockResolvedValue(true),
      updateStatus: vi.fn().mockResolvedValue({ id: campaignId }),
    };

    planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        maxActiveCampaigns: 5,
      }),
      countRunningCampaigns: vi.fn().mockResolvedValue(0),
      countConcurrentCampaignsAtTime: vi.fn().mockResolvedValue(0),
    };

    bolnaProvider = {
      scheduleBatch: vi.fn().mockResolvedValue({ state: "scheduled" }),
    };

    runUseCase = new RunBatchUseCase(
      batchRepo as unknown as BatchRepository,
      campaignRepo as unknown as CampaignRepository,
      bolnaProvider as unknown as BolnaBatchProvider,
      planRepo as unknown as PlanRepository,
    );

    scheduleUseCase = new ScheduleBatchUseCase(
      batchRepo as unknown as BatchRepository,
      campaignRepo as unknown as CampaignRepository,
      bolnaProvider as unknown as BolnaBatchProvider,
      planRepo as unknown as PlanRepository,
    );
  });

  it("reopens a COMPLETED campaign when run is clicked on a CREATED batch", async () => {
    await runUseCase.execute(tenantId, campaignId, batchId);

    expect(campaignRepo.reopenCampaignForNewBatch).toHaveBeenCalledWith(
      campaignId,
      { startedAt: expect.any(Date) },
    );
    expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
  });

  it("reopens a FAILED campaign when a batch is explicitly scheduled", async () => {
    campaignRepo.findByIdWithRelations.mockResolvedValue({
      id: campaignId,
      tenantId,
      status: "FAILED",
      provider: "BOLNA",
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    await scheduleUseCase.execute(
      tenantId,
      campaignId,
      batchId,
      new Date(Date.now() + 3_600_000).toISOString(),
    );

    expect(campaignRepo.reopenCampaignForNewBatch).toHaveBeenCalledWith(
      campaignId,
      { startedAt: null },
    );
    expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects an enforcement-stopped campaign before talking to the provider", async () => {
    campaignRepo.hasLowBalanceStoppedLeads.mockResolvedValue(true);

    await expect(
      runUseCase.execute(tenantId, campaignId, batchId),
    ).rejects.toThrow(CampaignStoppedForLowBalanceError);
    expect(bolnaProvider.scheduleBatch).not.toHaveBeenCalled();
    expect(campaignRepo.reopenCampaignForNewBatch).not.toHaveBeenCalled();
  });
});
