import { describe, it, expect } from "vitest";
import {
  CallEntity,
  type CallEntityData,
} from "../../../src/modules/calls/domain/entities/call.entity";

describe("CallEntity", () => {
  const baseCallData: CallEntityData = {
    id: "call-123",
    bolnaCallId: "bolna-call-abc",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    leadId: "lead-1",
    batchId: "batch-1",
    status: "COMPLETED",
    duration: 95,
    cost: 150,
    platformCost: 200,
    billableSeconds: 120,
    recording: "https://recordings.bolna.ai/call-123.mp3",
    transcript: "Agent: Hello\nUser: Hi there",
    transcriptMessages: [
      { role: "assistant", message: "Hello", time: null },
      { role: "user", message: "Hi there", time: null },
    ],
    summary: "Interested lead",
    callHistory: null,
    extractionResult: { budget: "50L", timeline: "immediate" },
    startedAt: new Date("2026-10-12T10:00:00Z"),
    endedAt: new Date("2026-10-12T10:01:35Z"),
    createdAt: new Date("2026-10-12T10:00:00Z"),
    updatedAt: new Date("2026-10-12T10:01:40Z"),
    isDeleted: false,
    deletedAt: null,
  };

  it("exposes all entity getters accurately", () => {
    const call = new CallEntity(baseCallData);

    expect(call.id).toBe("call-123");
    expect(call.bolnaCallId).toBe("bolna-call-abc");
    expect(call.tenantId).toBe("tenant-1");
    expect(call.campaignId).toBe("campaign-1");
    expect(call.leadId).toBe("lead-1");
    expect(call.status).toBe("COMPLETED");
    expect(call.duration).toBe(95);
    expect(call.cost).toBe(150);
    expect(call.ourCostPaisa).toBe(200);
    expect(call.billableSeconds).toBe(120);
    expect(call.isDeleted).toBe(false);
    expect(call.deletedAt).toBeNull();
  });

  it("exports exact primitives via toPrimitives", () => {
    const call = new CallEntity(baseCallData);
    const primitives = call.toPrimitives();

    expect(primitives).toEqual(baseCallData);
    expect(primitives.extractionResult).toEqual({
      budget: "50L",
      timeline: "immediate",
    });
  });

  it("supports archived / deleted call state", () => {
    const deletedDate = new Date("2026-10-12T12:00:00Z");
    const call = new CallEntity({
      ...baseCallData,
      isDeleted: true,
      deletedAt: deletedDate,
    });

    expect(call.isDeleted).toBe(true);
    expect(call.deletedAt).toEqual(deletedDate);
  });
});
