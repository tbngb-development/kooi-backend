import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveCallingWindow,
  type CallingWindow,
  type ResolveCallingWindowInput,
} from "../../../shared/utils/calling-window";

vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

import { RunBatchUseCase } from "../application/use-cases/run-batch.use-case";
import { ScheduleBatchUseCase } from "../application/use-cases/schedule-batch.use-case";
import { ResumeBatchUseCase } from "../application/use-cases/resume-batch.use-case";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { CallingWindowService } from "../../campaigns/application/services/calling-window.service";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";

function requiredWindow(input: ResolveCallingWindowInput): CallingWindow {
  const resolved = resolveCallingWindow(input);
  if (!resolved) throw new Error("Expected a calling window");
  return resolved;
}

const window = requiredWindow({
  campaignSchedule: {
    allowed_start_time: "09:00",
    allowed_end_time: "21:00",
    allowed_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    timezone: "Asia/Kolkata",
  },
});

const campaignData = {
  id: "camp-1",
  status: "RUNNING",
  provider: "BOLNA",
  variables: {},
};

const findByIdWithRelations = vi.fn().mockResolvedValue(campaignData);
const resolveWindow = vi.fn().mockResolvedValue(window);

const campaignRepo = {
  findByIdWithRelations,
  hasLowBalanceStoppedLeads: vi.fn().mockResolvedValue(false),
} as unknown as CampaignRepository;

const closedWindowService = {
  resolveWindow,
} as unknown as CallingWindowService;

describe("batch calling-window guards", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T16:00:00.000Z")); // 21:30 IST
    vi.clearAllMocks();
    findByIdWithRelations.mockResolvedValue(campaignData);
    resolveWindow.mockResolvedValue(window);
  });

  it("refuses to run a batch after the window closes", async () => {
    const batchRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "batch-1",
        status: "CREATED",
        bolnaBatchId: "bolna-batch-1",
        totalLeads: 1,
      }),
    } as unknown as BatchRepository;
    const bolnaProvider = { scheduleBatch: vi.fn() } as unknown as BolnaBatchProvider;

    const useCase = new RunBatchUseCase(
      batchRepo,
      campaignRepo,
      bolnaProvider,
      {} as unknown as PlanRepository,
      undefined,
      undefined,
      closedWindowService,
    );

    await expect(
      useCase.execute("tenant-1", "camp-1", "batch-1"),
    ).rejects.toThrow(/outside the calling window/i);
    expect(bolnaProvider.scheduleBatch).not.toHaveBeenCalled();
  });

  it("refuses to schedule a batch outside the window", async () => {
    const batchRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "batch-1",
        status: "CREATED",
        bolnaBatchId: "bolna-batch-1",
        totalLeads: 1,
      }),
    } as unknown as BatchRepository;
    const bolnaProvider = { scheduleBatch: vi.fn() } as unknown as BolnaBatchProvider;

    const useCase = new ScheduleBatchUseCase(
      batchRepo,
      campaignRepo,
      bolnaProvider,
      {} as unknown as PlanRepository,
      undefined,
      undefined,
      closedWindowService,
    );

    await expect(
      useCase.execute(
        "tenant-1",
        "camp-1",
        "batch-1",
        "2026-11-24T16:00:00.000Z", // 21:30 IST (future)
      ),
    ).rejects.toThrow(/outside the calling window/i);
    expect(bolnaProvider.scheduleBatch).not.toHaveBeenCalled();
  });

  it("refuses to resume a batch outside the window", async () => {
    const batchRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "batch-1",
        status: "STOPPED",
        bolnaBatchId: "bolna-batch-1",
        totalLeads: 1,
      }),
      findPendingLeads: vi.fn(),
    } as unknown as BatchRepository;

    const useCase = new ResumeBatchUseCase(
      batchRepo,
      campaignRepo,
      {} as unknown as FileStorageProvider,
      {} as unknown as BolnaBatchProvider,
      undefined,
      undefined,
      closedWindowService,
    );

    await expect(
      useCase.execute("tenant-1", "camp-1", "batch-1"),
    ).rejects.toThrow(/outside the calling window/i);
    expect(batchRepo.findPendingLeads).not.toHaveBeenCalled();
  });
});
