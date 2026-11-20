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
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      updateCallCostBreakdown: vi.fn().mockResolvedValue(undefined),
      updateBatchStatus: vi.fn().mockResolvedValue(undefined),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
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
});
