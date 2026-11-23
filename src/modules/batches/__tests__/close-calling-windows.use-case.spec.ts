import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveCallingWindow,
  type CallingWindow,
  type ResolveCallingWindowInput,
} from "../../../shared/utils/calling-window";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";
import type { CallingWindowService } from "../../campaigns/application/services/calling-window.service";
import { CloseCallingWindowsUseCase } from "../application/use-cases/close-calling-windows.use-case";

function requiredWindow(input: ResolveCallingWindowInput): CallingWindow {
  const resolved = resolveCallingWindow(input);
  if (!resolved) throw new Error("Expected a calling window");
  return resolved;
}

const window = requiredWindow({
  campaignSchedule: {
    allowed_start_time: "09:00",
    allowed_end_time: "21:00",
    allowed_days: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    timezone: "Asia/Kolkata",
  },
});

const AT = new Date("2026-11-24T16:00:00.000Z"); // 21:30 IST, after close
const NEXT_START = new Date("2026-11-25T03:30:00.000Z"); // 09:00 IST next day
const WINDOW_END = new Date("2026-11-24T15:30:00.000Z"); // 21:00 IST

const activeBatch = {
  id: "batch-1",
  tenantId: "tenant-1",
  campaignId: "camp-1",
  bolnaBatchId: "bolna-batch-1",
  status: "RUNNING" as const,
  scheduledAt: null,
};

const carryLead = {
  id: "lead-1",
  name: "Lead",
  phone: "+919876543210",
  email: null,
  company: null,
  metadata: null,
};

function makeBatchRepo(overrides: Record<string, unknown> = {}) {
  return {
    findActiveBatchesAwaitingWindowClose: vi
      .fn()
      .mockResolvedValue([activeBatch]),
    findCarryForwardLeads: vi.fn().mockResolvedValue([carryLead]),
    markWindowPaused: vi.fn().mockResolvedValue(true),
    findById: vi.fn().mockResolvedValue({
      id: "batch-1",
      name: "Morning batch",
      fileName: "leads.csv",
      retryConfig: { enabled: false },
      termsAccepted: true,
      termsVersion: "v1",
    }),
    create: vi.fn().mockResolvedValue({ id: "successor-1" }),
    reassignLeadsByIdsToBatch: vi.fn().mockResolvedValue(1),
    getBatchSequenceNumber: vi.fn().mockResolvedValue(2),
    update: vi.fn().mockResolvedValue({ id: "successor-1" }),
    stopBatchCallsAndLeads: vi.fn(),
    ...overrides,
  } as unknown as BatchRepository;
}

function makeCampaignRepo() {
  return {
    findByIdWithRelations: vi.fn().mockResolvedValue({
      id: "camp-1",
      name: "Campaign",
      variables: {},
      assistant: { id: "assistant-1", platformAgent: { bolnaId: "agent-1" } },
    }),
  } as unknown as CampaignRepository;
}

function makeBolnaProvider(overrides: Record<string, unknown> = {}) {
  return {
    stopBatch: vi.fn().mockResolvedValue({ message: "ok", state: "stopped" }),
    createBatch: vi.fn().mockResolvedValue({ batch_id: "bolna-successor-1" }),
    scheduleBatch: vi.fn().mockResolvedValue({ message: "ok", state: "scheduled" }),
    ...overrides,
  } as unknown as BolnaBatchProvider;
}

function makeWindowService(resolved: typeof window | null = window) {
  return {
    resolveWindow: vi.fn().mockResolvedValue(resolved),
  } as unknown as CallingWindowService;
}

describe("CloseCallingWindowsUseCase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips batches that have no configured window", async () => {
    const batchRepo = makeBatchRepo();
    const bolnaProvider = makeBolnaProvider();

    const result = await new CloseCallingWindowsUseCase(
      batchRepo,
      makeCampaignRepo(),
      bolnaProvider,
      makeWindowService(null),
    ).execute();

    expect(result.skipped).toEqual(["batch-1"]);
    expect(bolnaProvider.stopBatch).not.toHaveBeenCalled();
    expect(batchRepo.markWindowPaused).not.toHaveBeenCalled();
  });

  it("skips batches whose window has not closed yet", async () => {
    const batchRepo = makeBatchRepo();
    const bolnaProvider = makeBolnaProvider();

    const result = await new CloseCallingWindowsUseCase(
      batchRepo,
      makeCampaignRepo(),
      bolnaProvider,
      makeWindowService(),
      undefined,
      () => new Date("2026-11-24T10:00:00.000Z"), // 15:30 IST, inside window
    ).execute();

    expect(result.skipped).toEqual(["batch-1"]);
    expect(bolnaProvider.stopBatch).not.toHaveBeenCalled();
  });

  it("stops only the provider batch and never stops local calls or leads", async () => {
    const batchRepo = makeBatchRepo({
      findCarryForwardLeads: vi.fn().mockResolvedValue([]),
    });
    const bolnaProvider = makeBolnaProvider();

    const result = await new CloseCallingWindowsUseCase(
      batchRepo,
      makeCampaignRepo(),
      bolnaProvider,
      makeWindowService(),
    ).execute();

    expect(bolnaProvider.stopBatch).toHaveBeenCalledWith(
      "tenant-1",
      "bolna-batch-1",
    );
    expect(batchRepo.stopBatchCallsAndLeads).not.toHaveBeenCalled();
    expect(batchRepo.markWindowPaused).toHaveBeenCalledWith("batch-1", AT);
    expect(result.paused).toEqual(["batch-1"]);
    expect(result.scheduled).toEqual([]);
  });

  it("carries forward pending leads into a successor batch scheduled at the next window start", async () => {
    const batchRepo = makeBatchRepo();
    const bolnaProvider = makeBolnaProvider();

    const result = await new CloseCallingWindowsUseCase(
      batchRepo,
      makeCampaignRepo(),
      bolnaProvider,
      makeWindowService(),
    ).execute();

    expect(batchRepo.findCarryForwardLeads).toHaveBeenCalledWith(
      "batch-1",
      WINDOW_END,
    );
    expect(batchRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        campaignId: "camp-1",
        totalLeads: 1,
      }),
    );
    expect(batchRepo.reassignLeadsByIdsToBatch).toHaveBeenCalledWith(
      ["lead-1"],
      "successor-1",
    );
    expect(bolnaProvider.scheduleBatch).toHaveBeenCalledWith(
      "tenant-1",
      "bolna-successor-1",
      "2026-11-25T09:00:00+05:30",
    );
    expect(batchRepo.update).toHaveBeenCalledWith(
      "successor-1",
      expect.objectContaining({
        status: "SCHEDULED",
        scheduledAt: NEXT_START,
      }),
    );
    expect(result.scheduled).toEqual(["successor-1"]);
  });

  it("does not create a successor when the pause marker was already claimed", async () => {
    const batchRepo = makeBatchRepo({ markWindowPaused: vi.fn().mockResolvedValue(false) });
    const bolnaProvider = makeBolnaProvider();

    const result = await new CloseCallingWindowsUseCase(
      batchRepo,
      makeCampaignRepo(),
      bolnaProvider,
      makeWindowService(),
    ).execute();

    expect(batchRepo.create).not.toHaveBeenCalled();
    expect(result.paused).toEqual([]);
    expect(result.skipped).toEqual(["batch-1"]);
  });

  it("leaves the batch active so a later tick can retry when the provider stop fails", async () => {
    const batchRepo = makeBatchRepo();
    const bolnaProvider = makeBolnaProvider({
      stopBatch: vi.fn().mockRejectedValue(new Error("provider down")),
    });

    const result = await new CloseCallingWindowsUseCase(
      batchRepo,
      makeCampaignRepo(),
      bolnaProvider,
      makeWindowService(),
    ).execute();

    expect(batchRepo.markWindowPaused).not.toHaveBeenCalled();
    expect(batchRepo.create).not.toHaveBeenCalled();
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].batchId).toBe("batch-1");
  });
});
