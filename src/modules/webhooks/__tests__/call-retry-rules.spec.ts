import { describe, expect, it } from "vitest";
import {
  getBolnaEventAttempt,
  getCallRecordAttempt,
  mapLastRetryToLeadStatus,
  mapRetryStatusToCallStatus,
} from "../domain/rules/call-retry.rules";
import {
  canTransitionCallStatus,
  isRetryableTerminalCallStatus,
} from "../domain/rules/call-state-machine.rules";
import type { ResolvedCallContext } from "../application/interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../application/dto/webhook.dto";

function callWithHistory(attempts: number[]): ResolvedCallContext {
  return {
    callHistory: attempts.map((attempt) => ({ attempt })),
  } as unknown as ResolvedCallContext;
}

describe("Bolna retry rules", () => {
  it.each(["scheduled", "rescheduled"])(
    "maps %s webhook status to SCHEDULED call status",
    (status) => {
      expect(mapRetryStatusToCallStatus(status)).toBe("SCHEDULED");
    },
  );

  it.each(["scheduled", "rescheduled"])(
    "maps %s webhook status to PENDING lead status",
    (status) => {
      expect(mapLastRetryToLeadStatus(status)).toBe("PENDING");
    },
  );

  it("does not treat the legacy hyphenated re-scheduled status as a retry", () => {
    expect(mapRetryStatusToCallStatus("re-scheduled")).toBe("FAILED");
    expect(mapLastRetryToLeadStatus("re-scheduled")).toBe("FAILED");
  });

  it("uses retry_count as the primary attempt source", () => {
    expect(
      getBolnaEventAttempt({
        retry_count: 2,
        retry_history: [{ attempt: 1, status: "busy" }],
      } as WebhookCallPayload),
    ).toBe(3);
  });

  it("falls back to retry_history when retry_count is absent", () => {
    expect(
      getBolnaEventAttempt({
        retry_history: [{ attempt: 1 }, { attempt: 2 }],
      } as WebhookCallPayload),
    ).toBe(2);
  });

  it("reads the stored attempt from callHistory", () => {
    expect(getCallRecordAttempt(callWithHistory([1, 2]))).toBe(2);
  });

  it("treats only BUSY, NO_ANSWER and FAILED as retryable terminal states", () => {
    expect(isRetryableTerminalCallStatus("BUSY")).toBe(true);
    expect(isRetryableTerminalCallStatus("NO_ANSWER")).toBe(true);
    expect(isRetryableTerminalCallStatus("FAILED")).toBe(true);
    expect(isRetryableTerminalCallStatus("COMPLETED")).toBe(false);
    expect(isRetryableTerminalCallStatus("STOPPED")).toBe(false);
  });

  it("does not overwrite one terminal disposition with another on the same attempt", () => {
    expect(canTransitionCallStatus("BUSY", "FAILED")).toBe(false);
    expect(canTransitionCallStatus("NO_ANSWER", "BUSY")).toBe(false);
    expect(canTransitionCallStatus("FAILED", "NO_ANSWER")).toBe(false);
  });

  it("allows an identical terminal replay", () => {
    expect(canTransitionCallStatus("COMPLETED", "COMPLETED")).toBe(true);
    expect(canTransitionCallStatus("FAILED", "FAILED")).toBe(true);
  });

  it("allows a higher retry attempt to leave a retryable terminal state", () => {
    expect(
      canTransitionCallStatus("NO_ANSWER", "SCHEDULED", {
        currentAttempt: 1,
        incomingAttempt: 2,
      }),
    ).toBe(true);
    expect(
      canTransitionCallStatus("BUSY", "CALLING", {
        currentAttempt: 1,
        incomingAttempt: 2,
      }),
    ).toBe(true);
    expect(
      canTransitionCallStatus("FAILED", "BUSY", {
        currentAttempt: 1,
        incomingAttempt: 2,
      }),
    ).toBe(true);
  });

  it("never reopens COMPLETED or STOPPED for a later attempt", () => {
    expect(
      canTransitionCallStatus("COMPLETED", "SCHEDULED", {
        currentAttempt: 1,
        incomingAttempt: 2,
      }),
    ).toBe(false);
    expect(
      canTransitionCallStatus("STOPPED", "CALLING", {
        currentAttempt: 1,
        incomingAttempt: 2,
      }),
    ).toBe(false);
  });

  it("allows SCHEDULED to advance to CALLING", () => {
    expect(canTransitionCallStatus("SCHEDULED", "CALLING")).toBe(true);
  });
});
