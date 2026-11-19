import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessCallWebhookUseCase } from "../application/use-cases/process-call-webhook.use-case";
import { CallCompletionService } from "../application/services/call-completion.service";
import type { WebhookRepository, ResolvedCallContext } from "../application/interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../application/dto/webhook.dto";
import type { DebitWalletForCallUseCase } from "../../wallet/application/use-cases/debit-wallet.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const resolvedCall = {
  id: "call-1",
  tenantId: "tenant-1",
  leadId: "lead-1",
  campaignId: "campaign-1",
  batchId: "batch-1",
  bolnaCallId: "exec-1",
  provider: "BOLNA",
  status: "CALLING",
  duration: null,
  cost: null,
  recording: null,
  transcript: null,
  summary: null,
  callHistory: [],
  updatedAt: new Date(),
} as unknown as ResolvedCallContext;

function payloadWithStatus(status: string): WebhookCallPayload {
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

describe("Bolna call webhook billing status correctness", () => {
  let repo: WebhookRepository;
  let resolver: { resolveCallRecord: ReturnType<typeof vi.fn> };
  let debit: { execute: ReturnType<typeof vi.fn> };
  let completion: CallCompletionService;
  let completionSpy: ReturnType<typeof vi.spyOn>;
  let terminal: { handleCallTerminal: ReturnType<typeof vi.fn>; handleCallCanceled: ReturnType<typeof vi.fn> };
  let useCase: ProcessCallWebhookUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      updateCallTerminalState: vi.fn().mockResolvedValue(undefined),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      updateCallCostBreakdown: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebhookRepository;

    resolver = {
      resolveCallRecord: vi.fn().mockResolvedValue(resolvedCall),
    };

    debit = {
      execute: vi.fn().mockResolvedValue({
        amountPaisa: 1500,
        billableSeconds: 45,
        planVersionId: "pv-1",
        appliedRate: 2000,
        appliedMinSec: 30,
        appliedIncrementSec: 15,
      }),
    };

    completion = new CallCompletionService(
      repo,
      undefined,
      debit as unknown as DebitWalletForCallUseCase,
      undefined,
      undefined,
      logger,
    );
    completionSpy = vi.spyOn(completion, "handleCallCompleted");

    terminal = {
      handleCallTerminal: vi.fn().mockResolvedValue(undefined),
      handleCallCanceled: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new ProcessCallWebhookUseCase(
      repo,
      resolver as never,
      completion,
      terminal as never,
      undefined,
      logger,
    );
  });

  it.each(["completed", "ended", "call-completed", "call_completed"])(
    "posts a wallet debit for billable status %s",
    async (status) => {
      await useCase.execute(payloadWithStatus(status));

      expect(completionSpy).toHaveBeenCalledTimes(1);
      expect(debit.execute).toHaveBeenCalledTimes(1);
      expect(debit.execute).toHaveBeenCalledWith(
        expect.objectContaining({ callId: "call-1", durationSec: 45 }),
      );
    },
  );

  it.each([
    "call-disconnected",
    "call_disconnected",
    "disconnected",
    "failed",
    "no-answer",
    "brand-new-status",
  ])("does not post a wallet debit for non-billable status %s", async (status) => {
    await useCase.execute(payloadWithStatus(status));

    expect(completionSpy).not.toHaveBeenCalled();
    expect(debit.execute).not.toHaveBeenCalled();
  });
});
