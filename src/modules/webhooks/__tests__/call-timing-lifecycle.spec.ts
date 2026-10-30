import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessCallWebhookUseCase } from "../application/use-cases/process-call-webhook.use-case";
import { CallTerminalService } from "../application/services/call-terminal.service";
import { CallCompletionService } from "../application/services/call-completion.service";
import type { CallLifecycleService } from "../application/services/call-lifecycle.service";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../application/interfaces/webhook-repository.interface";
import type { CallResolverService } from "../application/services/call-resolver.service";
import type { WebhookCallPayload } from "../application/dto/webhook.dto";
import type { CallHistoryItem } from "../../../shared/types/bolna.types";
import type { CallStatus } from "@prisma/client";

function makePayload(
  data: Partial<WebhookCallPayload> & { id: string; status: string },
): WebhookCallPayload {
  return data as unknown as WebhookCallPayload;
}

describe("Call Timing Lifecycle Specification", () => {
  let mockCall: ResolvedCallContext;
  let webhookRepo: Partial<WebhookRepository>;
  let callResolver: Partial<CallResolverService>;
  let callLifecycle: Partial<CallLifecycleService>;
  let callTerminal: CallTerminalService;
  let callCompletion: CallCompletionService;
  let useCase: ProcessCallWebhookUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCall = {
      id: "call-uuid-1",
      bolnaCallId: "bolna-exec-1",
      tenantId: "tenant-uuid-1",
      campaignId: "campaign-uuid-1",
      assistantId: "assistant-uuid-1",
      leadId: "lead-uuid-1",
      batchId: "batch-uuid-1",
      type: "OUTBOUND",
      source: "CAMPAIGN",
      status: "PENDING",
      agentNumber: "+1234567890",
      duration: 0,
      cost: 0,
      recording: null,
      transcript: null,
      summary: null,
      callHistory: [],
      startedAt: null,
      endedAt: null,
      updatedAt: new Date("2026-10-30T10:00:00.000Z"),
      retryConfig: {
        enabled: true,
        max_retries: 2,
        retry_on_statuses: ["no-answer", "busy", "failed"],
      },
      campaignDefaultRetryConfig: null,
    };

    webhookRepo = {
      findBatchStatusById: vi.fn().mockResolvedValue("RUNNING"),
      updateCallStatusAndHistory: vi
        .fn()
        .mockImplementation(
          async (
            _id: string,
            _bolnaId: string,
            status: CallStatus,
            history: CallHistoryItem[],
            _agentNumber?: string | null,
            timestamps?: { startedAt?: Date | null; endedAt?: Date | null },
          ) => {
            mockCall.status = status;
            mockCall.callHistory = history;
            if (timestamps?.startedAt !== undefined) {
              mockCall.startedAt = timestamps.startedAt;
            }
            if (timestamps?.endedAt !== undefined) {
              mockCall.endedAt = timestamps.endedAt;
            }
            return { ...mockCall };
          },
        ),
      updateCallTerminalState: vi
        .fn()
        .mockImplementation(
          async (
            _id: string,
            data: Parameters<WebhookRepository["updateCallTerminalState"]>[1],
          ) => {
            mockCall.status = data.status;
            if (data.callHistory !== undefined) {
              mockCall.callHistory = data.callHistory as CallHistoryItem[];
            }
            if (data.startedAt !== undefined) {
              mockCall.startedAt = data.startedAt;
            }
            if (data.endedAt !== undefined) {
              mockCall.endedAt = data.endedAt;
            }
            if (data.duration !== undefined && data.duration !== null) {
              mockCall.duration = data.duration;
            }
          },
        ),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      updateBatchStatus: vi.fn().mockResolvedValue(undefined),
      updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
    };

    callResolver = {
      resolveCallRecord: vi.fn().mockImplementation(async () => {
        return {
          ...mockCall,
          callHistory: JSON.parse(JSON.stringify(mockCall.callHistory)),
        };
      }),
    };

    callLifecycle = {
      checkBatchAndCampaignCompletion: vi.fn().mockResolvedValue(undefined),
    };

    callTerminal = new CallTerminalService(
      webhookRepo as WebhookRepository,
      callLifecycle as CallLifecycleService,
    );

    callCompletion = new CallCompletionService(
      webhookRepo as WebhookRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      callLifecycle as CallLifecycleService,
    );

    useCase = new ProcessCallWebhookUseCase(
      webhookRepo as WebhookRepository,
      callResolver as CallResolverService,
      callCompletion,
      callTerminal,
    );
  });

  it("1. First attempt starts: startedAt is set and endedAt is null", async () => {
    const payload = makePayload({
      id: "bolna-exec-1",
      status: "initiated",
      initiated_at: "2026-10-30T10:00:00.000Z",
    });

    await useCase.execute(payload);

    expect(mockCall.status).toBe("CALLING");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt).toBeNull();
    expect(mockCall.callHistory).toHaveLength(1);
    expect(mockCall.callHistory[0]).toMatchObject({
      attempt: 1,
      status: "CALLING",
      startedAt: "2026-10-30T10:00:00.000Z",
      endedAt: null,
    });
  });

  it("2. First attempt finishes: both timestamps reflect the first attempt", async () => {
    // Start attempt 1
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "initiated",
        initiated_at: "2026-10-30T10:00:00.000Z",
      }),
    );

    // Finish attempt 1 with NO_ANSWER
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "no-answer",
        batch_run_details: { retried: 0 },
        telephony_data: {
          duration: "20",
          end_time: "2026-10-30T10:00:20.000Z",
          hangup_reason: "no-answer",
        } as any,
      }),
    );

    expect(mockCall.status).toBe("NO_ANSWER");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:00:20.000Z");
    expect(mockCall.callHistory).toHaveLength(1);
    expect(mockCall.callHistory[0]).toMatchObject({
      attempt: 1,
      status: "NO_ANSWER",
      startedAt: "2026-10-30T10:00:00.000Z",
      endedAt: "2026-10-30T10:00:20.000Z",
      duration: 20,
    });
  });

  it("3. Retry scheduled: previous attempt timestamps remain unchanged", async () => {
    // Attempt 1 finishes
    mockCall.status = "NO_ANSWER";
    mockCall.startedAt = new Date("2026-10-30T10:00:00.000Z");
    mockCall.endedAt = new Date("2026-10-30T10:00:20.000Z");
    mockCall.callHistory = [
      {
        attempt: 1,
        bolnaCallId: "bolna-exec-1",
        status: "NO_ANSWER",
        duration: 20,
        cost: 0,
        timestamp: "2026-10-30T10:00:20.000Z",
        startedAt: "2026-10-30T10:00:00.000Z",
        endedAt: "2026-10-30T10:00:20.000Z",
        errorMessage: null,
        hangupReason: "no-answer",
      },
    ];

    // Bolna schedules retry 1
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "scheduled",
        created_at: "2026-10-30T10:02:00.000Z",
        retry_history: [
          {
            attempt: 1,
            status: "no-answer",
            duration: 20,
            started_at: "2026-10-30T10:00:00.000Z",
            ended_at: "2026-10-30T10:00:20.000Z",
          },
        ],
      }),
    );

    expect(mockCall.status).toBe("SCHEDULED");
    // Verify timestamps are NOT modified by scheduled event
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:00:20.000Z");
    expect(mockCall.callHistory).toHaveLength(1);
    expect(mockCall.callHistory[0].startedAt).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.callHistory[0].endedAt).toBe("2026-10-30T10:00:20.000Z");
  });

  it("4. Second attempt starts: startedAt updates and endedAt resets to null", async () => {
    // Setup state in SCHEDULED
    mockCall.status = "SCHEDULED";
    mockCall.startedAt = new Date("2026-10-30T10:00:00.000Z");
    mockCall.endedAt = new Date("2026-10-30T10:00:20.000Z");
    mockCall.callHistory = [
      {
        attempt: 1,
        bolnaCallId: "bolna-exec-1",
        status: "NO_ANSWER",
        duration: 20,
        cost: 0,
        timestamp: "2026-10-30T10:00:20.000Z",
        startedAt: "2026-10-30T10:00:00.000Z",
        endedAt: "2026-10-30T10:00:20.000Z",
        errorMessage: null,
        hangupReason: "no-answer",
      },
    ];

    // Retry 1 starts
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "in-progress",
        batch_run_details: { retried: 1 },
        initiated_at: "2026-10-30T10:05:00.000Z",
      }),
    );

    expect(mockCall.status).toBe("CALLING");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:05:00.000Z");
    expect(mockCall.endedAt).toBeNull();
    expect(mockCall.callHistory).toHaveLength(2);
    // Attempt 1 preserved
    expect(mockCall.callHistory[0]).toMatchObject({
      attempt: 1,
      status: "NO_ANSWER",
      startedAt: "2026-10-30T10:00:00.000Z",
      endedAt: "2026-10-30T10:00:20.000Z",
    });
    // Attempt 2 in progress
    expect(mockCall.callHistory[1]).toMatchObject({
      attempt: 2,
      status: "CALLING",
      startedAt: "2026-10-30T10:05:00.000Z",
      endedAt: null,
    });
  });

  it("5. Second attempt finishes: both timestamps reflect the second attempt", async () => {
    // Attempt 2 is CALLING
    mockCall.status = "CALLING";
    mockCall.startedAt = new Date("2026-10-30T10:05:00.000Z");
    mockCall.endedAt = null;
    mockCall.callHistory = [
      {
        attempt: 1,
        bolnaCallId: "bolna-exec-1",
        status: "NO_ANSWER",
        duration: 20,
        cost: 0,
        timestamp: "2026-10-30T10:00:20.000Z",
        startedAt: "2026-10-30T10:00:00.000Z",
        endedAt: "2026-10-30T10:00:20.000Z",
        errorMessage: null,
        hangupReason: "no-answer",
      },
      {
        attempt: 2,
        bolnaCallId: "bolna-exec-1",
        status: "CALLING",
        startedAt: "2026-10-30T10:05:00.000Z",
        endedAt: null,
        timestamp: "2026-10-30T10:05:00.000Z",
      },
    ];

    // Attempt 2 finishes with BUSY
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "busy",
        batch_run_details: { retried: 1 },
        telephony_data: {
          duration: "12",
          end_time: "2026-10-30T10:05:12.000Z",
          hangup_reason: "busy",
        } as any,
      }),
    );

    expect(mockCall.status).toBe("BUSY");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:05:00.000Z");
    expect((mockCall.endedAt as Date | null)?.toISOString()).toBe(
      "2026-10-30T10:05:12.000Z",
    );
    expect(mockCall.callHistory).toHaveLength(2);
    expect(mockCall.callHistory[1]).toMatchObject({
      attempt: 2,
      status: "BUSY",
      startedAt: "2026-10-30T10:05:00.000Z",
      endedAt: "2026-10-30T10:05:12.000Z",
      duration: 12,
    });
  });

  it("6. Third attempt starts and finishes: timestamps update again", async () => {
    // Attempt 2 finished with BUSY
    mockCall.status = "BUSY";
    mockCall.startedAt = new Date("2026-10-30T10:05:00.000Z");
    mockCall.endedAt = new Date("2026-10-30T10:05:12.000Z");
    mockCall.callHistory = [
      {
        attempt: 1,
        bolnaCallId: "bolna-exec-1",
        status: "NO_ANSWER",
        duration: 20,
        cost: 0,
        timestamp: "2026-10-30T10:00:20.000Z",
        startedAt: "2026-10-30T10:00:00.000Z",
        endedAt: "2026-10-30T10:00:20.000Z",
      },
      {
        attempt: 2,
        bolnaCallId: "bolna-exec-1",
        status: "BUSY",
        duration: 12,
        cost: 0,
        timestamp: "2026-10-30T10:05:12.000Z",
        startedAt: "2026-10-30T10:05:00.000Z",
        endedAt: "2026-10-30T10:05:12.000Z",
      },
    ];

    // Retry 2 scheduled
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "scheduled",
        retry_history: [
          { attempt: 1, status: "no-answer" },
          { attempt: 2, status: "busy" },
        ],
      }),
    );
    expect(mockCall.status).toBe("SCHEDULED");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:05:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:05:12.000Z");

    // Attempt 3 starts
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "ringing",
        batch_run_details: { retried: 2 },
        initiated_at: "2026-10-30T10:10:00.000Z",
      }),
    );
    expect(mockCall.status).toBe("CALLING");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:10:00.000Z");
    expect(mockCall.endedAt).toBeNull();
    expect(mockCall.callHistory).toHaveLength(3);
    expect(mockCall.callHistory[2]).toMatchObject({
      attempt: 3,
      status: "CALLING",
      startedAt: "2026-10-30T10:10:00.000Z",
      endedAt: null,
    });

    // Attempt 3 completes successfully
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "completed",
        batch_run_details: { retried: 2 },
        telephony_data: {
          duration: "55",
          end_time: "2026-10-30T10:10:55.000Z",
        } as any,
      }),
    );
    expect(mockCall.status).toBe("COMPLETED");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:10:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:10:55.000Z");
    expect(mockCall.callHistory).toHaveLength(3);
    expect(mockCall.callHistory[2]).toMatchObject({
      attempt: 3,
      status: "COMPLETED",
      startedAt: "2026-10-30T10:10:00.000Z",
      endedAt: "2026-10-30T10:10:55.000Z",
      duration: 55,
    });
  });

  it("7. Duplicate start/completion webhooks do not corrupt timestamps", async () => {
    // Attempt 1 starts at 10:00:00
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "initiated",
        initiated_at: "2026-10-30T10:00:00.000Z",
      }),
    );

    // Duplicate progress event arrives later (10:00:08)
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "ringing",
        initiated_at: "2026-10-30T10:00:08.000Z",
      }),
    );

    // startedAt must NOT drift forward to 10:00:08
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt).toBeNull();
    expect(mockCall.callHistory[0].startedAt).toBe("2026-10-30T10:00:00.000Z");

    // Call completes
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "completed",
        telephony_data: {
          duration: "40",
          end_time: "2026-10-30T10:00:40.000Z",
        } as any,
      }),
    );
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:00:40.000Z");

    // Duplicate completion webhook arrives
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "completed",
        telephony_data: {
          duration: "40",
          end_time: "2026-10-30T10:00:40.000Z",
        } as any,
      }),
    );
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:00:40.000Z");
    expect(mockCall.callHistory).toHaveLength(1);
  });

  it("8. Out-of-order events from an earlier attempt do not overwrite latest attempt's timestamps", async () => {
    // Current state: Attempt 2 is CALLING, started at 10:05:00
    mockCall.status = "CALLING";
    mockCall.startedAt = new Date("2026-10-30T10:05:00.000Z");
    mockCall.endedAt = null;
    mockCall.callHistory = [
      {
        attempt: 1,
        bolnaCallId: "bolna-exec-1",
        status: "NO_ANSWER",
        duration: 20,
        cost: 0,
        timestamp: "2026-10-30T10:00:20.000Z",
        startedAt: "2026-10-30T10:00:00.000Z",
        endedAt: "2026-10-30T10:00:20.000Z",
      },
      {
        attempt: 2,
        bolnaCallId: "bolna-exec-1",
        status: "CALLING",
        startedAt: "2026-10-30T10:05:00.000Z",
        endedAt: null,
        timestamp: "2026-10-30T10:05:00.000Z",
      },
    ];

    // Delayed ringing event from attempt 1 (retried: 0) arrives late
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "ringing",
        batch_run_details: { retried: 0 },
        initiated_at: "2026-10-30T10:00:05.000Z",
      }),
    );

    // Attempt 2 timing is NOT overwritten
    expect(mockCall.status).toBe("CALLING");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:05:00.000Z");
    expect(mockCall.endedAt).toBeNull();
    expect(mockCall.callHistory).toHaveLength(2);

    // Delayed terminal event from attempt 1 (retried: 0) arrives late
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "no-answer",
        batch_run_details: { retried: 0 },
        telephony_data: {
          duration: "20",
          end_time: "2026-10-30T10:00:20.000Z",
        } as any,
      }),
    );

    // Still on attempt 2!
    expect(mockCall.status).toBe("CALLING");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:05:00.000Z");
    expect(mockCall.endedAt).toBeNull();
  });

  it("9. Existing non-retry call lifecycle behavior remains unchanged", async () => {
    mockCall.retryConfig = null; // No retries configured

    // Call starts
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "initiated",
        initiated_at: "2026-10-30T10:00:00.000Z",
      }),
    );
    expect(mockCall.status).toBe("CALLING");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt).toBeNull();

    // Call completes
    await useCase.execute(
      makePayload({
        id: "bolna-exec-1",
        status: "completed",
        telephony_data: {
          duration: "35",
          end_time: "2026-10-30T10:00:35.000Z",
        } as any,
      }),
    );

    expect(mockCall.status).toBe("COMPLETED");
    expect(mockCall.startedAt?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(mockCall.endedAt?.toISOString()).toBe("2026-10-30T10:00:35.000Z");
    expect(mockCall.callHistory).toHaveLength(1);
    expect(mockCall.callHistory[0]).toMatchObject({
      attempt: 1,
      status: "COMPLETED",
      startedAt: "2026-10-30T10:00:00.000Z",
      endedAt: "2026-10-30T10:00:35.000Z",
      duration: 35,
    });
  });
});
