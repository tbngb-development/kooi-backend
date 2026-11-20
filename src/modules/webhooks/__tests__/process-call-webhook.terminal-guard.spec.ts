import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallStatus } from "@prisma/client";
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

function callWithStatus(status: CallStatus): ResolvedCallContext {
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
    callHistory: [],
    updatedAt: new Date(),
  } as unknown as ResolvedCallContext;
}

function completionPayload(status: string): WebhookCallPayload {
  return {
    id: "exec-1",
    status,
    telephony_data: {
      duration: "45",
      recording_url: "https://example.com/rec.mp3",
      to_number: "+919999999999",
      from_number: "+918888888888",
    },
  };
}

describe("Bolna call webhook — late completion terminal guard", () => {
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
      markCampaignRunningIfActive: vi.fn().mockResolvedValue(false),
      findBatchStatusById: vi.fn().mockResolvedValue(null),
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

  it.each(["completed", "ended", "call-completed"] as const)(
    "ignores a late %s event after any different terminal outcome",
    async (incoming) => {
      for (const status of ["NO_ANSWER", "BUSY", "FAILED", "STOPPED"] as const) {
        vi.mocked(resolver.resolveCallRecord).mockResolvedValueOnce(
          callWithStatus(status),
        );

        await useCase.execute(completionPayload(incoming));

        expect(completion.handleCallCompleted).not.toHaveBeenCalled();
        expect(repo.updateCallTerminalState).not.toHaveBeenCalled();
        expect(repo.updateLeadStatus).not.toHaveBeenCalled();
        expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
        expect(terminal.handleCallCanceled).not.toHaveBeenCalled();
      }

      expect(logger.warn).toHaveBeenCalledWith(
        "Ignored late completion event on terminal call",
        expect.objectContaining({
          action: "webhook.call.completed_ignored",
          callId: "call-1",
        }),
      );
    },
  );

  it("still replays a duplicate completion so a provider retry can finish the work", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWithStatus("COMPLETED"),
    );

    await useCase.execute(completionPayload("completed"));

    expect(completion.handleCallCompleted).toHaveBeenCalledTimes(1);
    expect(completion.handleCallCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
      expect.any(Object),
      "exec-1",
    );
  });

  it.each(["CALLING", "PENDING", "SCHEDULED"] as const)(
    "applies a completion to a non-terminal %s call",
    async (status) => {
      vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
        callWithStatus(status),
      );

      await useCase.execute(completionPayload("completed"));

      expect(completion.handleCallCompleted).toHaveBeenCalledTimes(1);
    },
  );

  it("does nothing when the call could not be resolved", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(null);

    await useCase.execute(completionPayload("completed"));

    expect(completion.handleCallCompleted).not.toHaveBeenCalled();
  });

  it.each(["no-answer", "busy", "failed", "error", "balance-low"] as const)(
    "ignores a late %s event after COMPLETED or a credit-enforcement STOPPED",
    async (incoming) => {
      for (const current of ["COMPLETED", "STOPPED"] as const) {
        vi.mocked(resolver.resolveCallRecord).mockResolvedValueOnce(
          callWithStatus(current),
        );

        await useCase.execute(completionPayload(incoming));

        expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
      }
      expect(terminal.handleCallTerminal).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Ignored out-of-order terminal event",
        expect.objectContaining({ action: "webhook.call.terminal_ignored" }),
      );
    },
  );

  it.each(["stopped", "canceled"])(
    "ignores a late %s event after COMPLETED",
    async (incoming) => {
      vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
        callWithStatus("COMPLETED"),
      );

      await useCase.execute(completionPayload(incoming));

      expect(terminal.handleCallCanceled).not.toHaveBeenCalled();
    },
  );

  it("allows retry dispositions to advance between NO_ANSWER, BUSY and FAILED", async () => {
    for (const [current, incoming] of [
      ["CALLING", "no-answer"],
      ["NO_ANSWER", "no-answer"],
      ["NO_ANSWER", "busy"],
      ["BUSY", "failed"],
      ["FAILED", "no-answer"],
      ["NO_ANSWER", "stopped"],
    ] as const) {
      vi.mocked(resolver.resolveCallRecord).mockResolvedValueOnce(
        callWithStatus(current),
      );

      await useCase.execute(completionPayload(incoming));
    }

    expect(terminal.handleCallTerminal).toHaveBeenCalledTimes(5);
    expect(terminal.handleCallCanceled).toHaveBeenCalledTimes(1);
  });

  it("replays a stop event on an already STOPPED call", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWithStatus("STOPPED"),
    );

    await useCase.execute(completionPayload("stopped"));

    // The service itself no-ops for STOPPED; the idempotent replay is allowed.
    expect(terminal.handleCallCanceled).toHaveBeenCalledTimes(1);
  });

  it.each(["scheduled", "rescheduled"] as const)(
    "does not resurrect a finalized campaign on a late %s event",
    async (incoming) => {
      vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
        callWithStatus("PENDING"),
      );

      await useCase.execute(completionPayload(incoming));

      expect(repo.markCampaignRunningIfActive).toHaveBeenCalledWith(
        "campaign-1",
      );
      expect(repo.updateCampaignStatus).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Ignored campaign RUNNING update on finalized campaign",
        expect.objectContaining({
          action: "webhook.campaign.running_ignored",
          campaignId: "campaign-1",
          incomingState: incoming,
        }),
      );
    },
  );

  it.each(["initiated", "ringing", "in-progress", "answered"] as const)(
    "does not resurrect a finalized campaign on a late %s event",
    async (incoming) => {
      vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
        callWithStatus("CALLING"),
      );

      await useCase.execute(completionPayload(incoming));

      expect(repo.markCampaignRunningIfActive).toHaveBeenCalledWith(
        "campaign-1",
        expect.any(Date),
      );
      expect(repo.updateCampaignStatus).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Ignored campaign RUNNING update on finalized campaign",
        expect.objectContaining({
          action: "webhook.campaign.running_ignored",
          campaignId: "campaign-1",
          incomingState: incoming,
        }),
      );
    },
  );

  it("keeps an active campaign RUNNING on a normal in-progress event", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWithStatus("PENDING"),
    );
    vi.mocked(repo.markCampaignRunningIfActive).mockResolvedValue(true);

    await useCase.execute(completionPayload("in-progress"));

    expect(repo.markCampaignRunningIfActive).toHaveBeenCalledWith(
      "campaign-1",
      expect.any(Date),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      "Ignored campaign RUNNING update on finalized campaign",
      expect.anything(),
    );
  });

  it("keeps an active campaign RUNNING on a scheduled retry event", async () => {
    vi.mocked(resolver.resolveCallRecord).mockResolvedValue(
      callWithStatus("NO_ANSWER"),
    );
    vi.mocked(repo.markCampaignRunningIfActive).mockResolvedValue(true);

    await useCase.execute({
      ...completionPayload("scheduled"),
      retry_history: [{ attempt: 2, status: "no-answer" }],
    });

    expect(repo.markCampaignRunningIfActive).toHaveBeenCalledWith("campaign-1");
    expect(logger.warn).not.toHaveBeenCalledWith(
      "Ignored campaign RUNNING update on finalized campaign",
      expect.anything(),
    );
  });
});
