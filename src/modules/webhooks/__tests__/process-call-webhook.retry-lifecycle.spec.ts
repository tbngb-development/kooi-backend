import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallStatus } from "@prisma/client";
import type { CallHistoryItem } from "../../../shared/types/bolna.types";
import { ProcessCallWebhookUseCase } from "../application/use-cases/process-call-webhook.use-case";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../application/interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../application/dto/webhook.dto";
import type { Logger } from "../../../shared/logging/logger.interface";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

function historyEntry(
  attempt: number,
  status: string,
  bolnaCallId = "exec-1",
): CallHistoryItem {
  return {
    attempt,
    bolnaCallId,
    status,
    duration: 0,
    cost: 0,
    timestamp: "2026-11-20T15:30:36.629Z",
    errorMessage: null,
    hangupReason: null,
  };
}

function callWith(
  status: CallStatus,
  callHistory: CallHistoryItem[] = [],
): ResolvedCallContext {
  return {
    id: "call-1",
    tenantId: "tenant-1",
    leadId: "lead-1",
    campaignId: "campaign-1",
    batchId: "batch-1",
    bolnaCallId: "exec-1",
    provider: "BOLNA",
    status,
    duration: null,
    cost: null,
    recording: null,
    transcript: null,
    summary: null,
    callHistory,
    updatedAt: new Date("2026-11-20T15:30:36.629Z"),
  } as unknown as ResolvedCallContext;
}

function payload(
  status: string,
  overrides: Record<string, unknown> = {},
): WebhookCallPayload {
  return {
    id: "exec-1",
    status,
    telephony_data: {
      duration: 0,
      recording_url: "https://example.com/rec.mp3",
      to_number: "+919999999999",
      from_number: "+918888888888",
    },
    ...overrides,
  } as WebhookCallPayload;
}

describe("Bolna webhook — retry execution lifecycle", () => {
  let repo: WebhookRepository;
  let resolver: { resolveCallRecord: ReturnType<typeof vi.fn> };
  let completion: { handleCallCompleted: ReturnType<typeof vi.fn> };
  let terminal: {
    handleCallTerminal: ReturnType<typeof vi.fn>;
    handleCallCanceled: ReturnType<typeof vi.fn>;
  };
  let useCase: ProcessCallWebhookUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      updateCallTerminalState: vi.fn().mockResolvedValue(undefined),
      updateCallStatusAndHistory: vi.fn().mockResolvedValue(undefined),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      updateCallCostBreakdown: vi.fn().mockResolvedValue(undefined),
      updateBatchStatus: vi.fn().mockResolvedValue(undefined),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
      markCampaignRunningIfActive: vi.fn().mockResolvedValue(true),
      findBatchStatusById: vi.fn().mockResolvedValue("RUNNING"),
    } as unknown as WebhookRepository;

    resolver = { resolveCallRecord: vi.fn() };
    completion = { handleCallCompleted: vi.fn().mockResolvedValue(undefined) };
    terminal = {
      handleCallTerminal: vi.fn().mockResolvedValue(undefined),
      handleCallCanceled: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ProcessCallWebhookUseCase(
      repo,
      resolver as never,
      completion as never,
      terminal as never,
      undefined,
      logger,
    );
  });

  it("creates a PENDING call context on queued", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(callWith("PENDING"));

    await useCase.execute(payload("queued"));

    expect(resolver.resolveCallRecord).toHaveBeenCalledWith(
      "exec-1",
      expect.any(Object),
      "PENDING",
    );
    expect(repo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "PENDING");
    expect(repo.updateCallTerminalState).not.toHaveBeenCalled();
    expect(repo.updateCallStatusAndHistory).not.toHaveBeenCalled();
  });

  it("does not downgrade an existing SCHEDULED call on queued", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("SCHEDULED", [historyEntry(2, "SCHEDULED")]),
    );

    await useCase.execute(payload("queued"));

    expect(resolver.resolveCallRecord).toHaveBeenCalledWith(
      "exec-1",
      expect.any(Object),
      "PENDING",
    );
    expect(repo.updateLeadStatus).not.toHaveBeenCalled();
    expect(repo.updateCallTerminalState).not.toHaveBeenCalled();
    expect(repo.updateCallStatusAndHistory).not.toHaveBeenCalled();
  });

  it("marks a scheduled retry as SCHEDULED with a PENDING lead", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(callWith("CALLING"));

    await useCase.execute(
      payload("scheduled", {
        retry_count: 1,
        retry_history: [{ attempt: 1, status: "no-answer" }],
      }),
    );

    expect(repo.updateCallStatusAndHistory).toHaveBeenCalledWith(
      "call-1",
      "exec-1",
      "SCHEDULED",
      expect.arrayContaining([
        expect.objectContaining({ attempt: 1, status: "NO_ANSWER" }),
        expect.objectContaining({ attempt: 2, status: "SCHEDULED" }),
      ]),
    );
    expect(repo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "PENDING");
    expect(repo.updateCallTerminalState).not.toHaveBeenCalled();
  });

  it("moves a terminal attempt to SCHEDULED on a higher retry count", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("NO_ANSWER", [historyEntry(1, "NO_ANSWER")]),
    );

    await useCase.execute(
      payload("rescheduled", {
        retry_count: 1,
        retry_history: [{ attempt: 1, status: "no-answer" }],
      }),
    );

    expect(repo.updateCallStatusAndHistory).toHaveBeenCalledWith(
      "call-1",
      "exec-1",
      "SCHEDULED",
      expect.arrayContaining([
        expect.objectContaining({ attempt: 2, status: "SCHEDULED" }),
      ]),
    );
    expect(repo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "PENDING");
  });

  it("ignores a duplicate scheduled event for the same attempt", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("SCHEDULED", [historyEntry(2, "SCHEDULED")]),
    );

    await useCase.execute(payload("scheduled", { retry_count: 1 }));

    expect(repo.updateCallStatusAndHistory).not.toHaveBeenCalled();
    expect(repo.updateCallTerminalState).not.toHaveBeenCalled();
    expect(repo.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("keeps the final terminal disposition after the last retry", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("SCHEDULED", [
        historyEntry(1, "NO_ANSWER"),
        historyEntry(2, "SCHEDULED"),
      ]),
    );

    await useCase.execute(
      payload("busy", { retry_count: 1, termination_reason: "busy" }),
    );

    expect(terminal.handleCallTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SCHEDULED" }),
      "BUSY",
      expect.any(Object),
    );
  });

  it("ignores a stale terminal event with a lower retry count", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("SCHEDULED", [
        historyEntry(1, "NO_ANSWER"),
        historyEntry(2, "SCHEDULED"),
      ]),
    );

    await useCase.execute(
      payload("no-answer", {
        retry_count: 0,
        termination_reason: "no-answer",
      }),
    );

    expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
  });

  it("does not let a same-attempt failure overwrite a different terminal outcome", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("BUSY", [historyEntry(1, "BUSY")]),
    );

    await useCase.execute(payload("failed", { retry_count: 0 }));

    expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
  });

  it("allows a higher-retry failure after a terminal attempt", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("BUSY", [historyEntry(1, "BUSY")]),
    );

    await useCase.execute(payload("failed", { retry_count: 1 }));

    expect(terminal.handleCallTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "BUSY" }),
      "FAILED",
      expect.any(Object),
    );
  });

  it("ignores an unrelated termination_reason and uses the webhook status", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(callWith("CALLING"));

    await useCase.execute(
      payload("busy", { termination_reason: "user_hung_up" }),
    );

    expect(terminal.handleCallTerminal).toHaveBeenCalledWith(
      expect.any(Object),
      "BUSY",
      expect.any(Object),
    );
  });

  it("treats call-disconnected as non-terminal CALLING", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(callWith("CALLING"));

    await useCase.execute(payload("call-disconnected"));

    expect(repo.updateCallStatusAndHistory).toHaveBeenCalledWith(
      "call-1",
      "exec-1",
      "CALLING",
      [],
    );
    expect(completion.handleCallCompleted).not.toHaveBeenCalled();
    expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
  });

  it("does not use run_id as a call identity", async () => {
    await expect(
      useCase.execute({
        run_id: "exec-1",
        status: "completed",
      } as unknown as WebhookCallPayload),
    ).rejects.toThrow("Missing execution / call ID.");
  });

  it("replays an identical completion without changing the terminal outcome", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWith("COMPLETED", [historyEntry(1, "COMPLETED")]),
    );

    await useCase.execute(payload("completed"));
    await useCase.execute(payload("completed"));

    expect(completion.handleCallCompleted).toHaveBeenCalledTimes(2);
    expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
  });
});
