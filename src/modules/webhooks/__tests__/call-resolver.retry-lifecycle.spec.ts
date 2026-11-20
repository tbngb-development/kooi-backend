import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallResolverService } from "../application/services/call-resolver.service";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../application/interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../application/dto/webhook.dto";
import type { Logger } from "../../../shared/logging/logger.interface";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    phoneNumber: { findUnique: vi.fn() },
    assistant: { findFirst: vi.fn() },
    lead: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

function queuedPayload(): WebhookCallPayload {
  return {
    id: "exec-1",
    batch_id: "bolna-batch-1",
    status: "queued",
    telephony_data: {
      duration: 0,
      recording_url: "https://example.com/rec.mp3",
      to_number: "+919999999999",
      from_number: "+918888888888",
    },
  };
}

function existingCall(status: ResolvedCallContext["status"]): ResolvedCallContext {
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

describe("CallResolverService — Bolna retry lifecycle", () => {
  let repo: WebhookRepository;
  let resolver: CallResolverService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      findCallByBolnaCallId: vi.fn().mockResolvedValue(null),
      findBatchIdByBolnaBatchId: vi.fn().mockResolvedValue({
        id: "batch-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "RUNNING",
      }),
      findLeadByPhoneAndBatch: vi.fn().mockResolvedValue({ id: "lead-1" }),
      findLeadByPhoneAndCampaign: vi.fn().mockResolvedValue(null),
      findCallByLeadAndBatch: vi.fn().mockResolvedValue(null),
      createCall: vi.fn().mockImplementation(async (data) => existingCall(data.status)),
      updateCallStatusAndHistory: vi
        .fn()
        .mockImplementation(async (callId, bolnaCallId, status) => ({
          ...existingCall(status),
          id: callId,
          bolnaCallId,
        })),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      updateCallTerminalState: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebhookRepository;

    resolver = new CallResolverService(repo, logger);
  });

  it("creates a PENDING call and lead for a queued campaign call", async () => {
    const resolved = await resolver.resolveCallRecord(
      "exec-1",
      queuedPayload(),
      "PENDING",
    );

    expect(repo.createCall).toHaveBeenCalledWith(
      expect.objectContaining({
        bolnaCallId: "exec-1",
        status: "PENDING",
      }),
    );
    expect(repo.updateLeadStatus).toHaveBeenCalledWith("lead-1", "PENDING");
    expect(resolved?.status).toBe("PENDING");
  });

  it("reuses an existing non-terminal row for a retry instead of creating a second call", async () => {
    vi.mocked(repo.findCallByLeadAndBatch).mockResolvedValue(
      existingCall("SCHEDULED"),
    );

    const payload = {
      ...queuedPayload(),
      id: "exec-2",
      status: "initiated",
    } as WebhookCallPayload;

    const resolved = await resolver.resolveCallRecord("exec-2", payload, "CALLING");

    expect(repo.createCall).not.toHaveBeenCalled();
    expect(repo.updateCallStatusAndHistory).toHaveBeenCalledWith(
      "call-1",
      "exec-2",
      "SCHEDULED",
      [],
      "+918888888888",
    );
    expect(resolved?.id).toBe("call-1");
  });
});
