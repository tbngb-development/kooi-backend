import { describe, expect, it } from "vitest";
import { evaluateNewBatchEligibility } from "../domain/rules/new-batch-eligibility.rules";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("evaluateNewBatchEligibility", () => {
  it("requires a guarded reopen for a normal COMPLETED campaign", () => {
    expect(
      evaluateNewBatchEligibility({
        status: "COMPLETED",
        provider: "BOLNA",
        hasLowBalanceLeads: false,
        now,
      }),
    ).toEqual({ allowed: true, needsReopen: true });
  });

  it("requires a guarded reopen for a normal FAILED campaign", () => {
    expect(
      evaluateNewBatchEligibility({
        status: "FAILED",
        provider: "BOLNA",
        hasLowBalanceLeads: false,
        now,
      }),
    ).toEqual({ allowed: true, needsReopen: true });
  });

  it("allows active and paused campaigns without a reopen", () => {
    for (const status of ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"] as const) {
      expect(
        evaluateNewBatchEligibility({
          status,
          provider: "BOLNA",
          hasLowBalanceLeads: false,
          now,
        }),
      ).toEqual({ allowed: true, needsReopen: false });
    }
  });

  it("rejects CANCELLED campaigns", () => {
    expect(
      evaluateNewBatchEligibility({
        status: "CANCELLED",
        provider: "BOLNA",
        hasLowBalanceLeads: false,
        now,
      }),
    ).toEqual({ allowed: false, reason: "CANCELLED" });
  });

  it("rejects expired and ended Sarvam campaigns", () => {
    expect(
      evaluateNewBatchEligibility({
        status: "COMPLETED",
        provider: "SARVAM",
        endTimestamp: new Date(now.getTime() - 1),
        hasLowBalanceLeads: false,
        now,
      }),
    ).toEqual({ allowed: false, reason: "ENDED" });

    expect(
      evaluateNewBatchEligibility({
        status: "COMPLETED",
        provider: "SARVAM",
        sarvamStatus: "ENDED",
        hasLowBalanceLeads: false,
        now,
      }),
    ).toEqual({ allowed: false, reason: "ENDED" });
  });

  it("allows a Sarvam campaign whose end time is still in the future", () => {
    expect(
      evaluateNewBatchEligibility({
        status: "COMPLETED",
        provider: "SARVAM",
        endTimestamp: new Date(now.getTime() + 60_000),
        sarvamStatus: "paused",
        hasLowBalanceLeads: false,
        now,
      }),
    ).toEqual({ allowed: true, needsReopen: true });
  });

  it("rejects credit-enforcement-stopped campaigns even when their status is terminal", () => {
    expect(
      evaluateNewBatchEligibility({
        status: "COMPLETED",
        provider: "BOLNA",
        hasLowBalanceLeads: true,
        now,
      }),
    ).toEqual({ allowed: false, reason: "LOW_BALANCE" });
  });
});
