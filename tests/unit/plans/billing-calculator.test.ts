import { describe, it, expect } from "vitest";
import { calculateCallCost } from "../../../src/modules/plans/domain/rules/billing-calculator";

describe("Billing Calculator Domain Rule (Module 4 - Financial Call Rating)", () => {
  it("returns 0 billable seconds and 0 cost for zero or negative duration", () => {
    expect(
      calculateCallCost({
        durationSec: 0,
        perMinuteRate: 150,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      }),
    ).toEqual({ billableSeconds: 0, costPaisa: 0 });

    expect(
      calculateCallCost({
        durationSec: -5,
        perMinuteRate: 150,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      }),
    ).toEqual({ billableSeconds: 0, costPaisa: 0 });
  });

  it("charges the minimum billing duration when call is shorter than billingMinimumSec", () => {
    // 12 second call with 30s minimum -> charged for 30 seconds
    const result = calculateCallCost({
      durationSec: 12,
      perMinuteRate: 120, // 1.20 INR / min = 2 paisa / sec
      billingMinimumSec: 30,
      billingIncrementSec: 10,
    });

    expect(result.billableSeconds).toBe(30);
    // (30 / 60) * 120 = 60 paisa (0.60 INR)
    expect(result.costPaisa).toBe(60);
  });

  it("charges exactly the minimum when call duration equals billingMinimumSec", () => {
    const result = calculateCallCost({
      durationSec: 30,
      perMinuteRate: 120,
      billingMinimumSec: 30,
      billingIncrementSec: 10,
    });

    expect(result.billableSeconds).toBe(30);
    expect(result.costPaisa).toBe(60);
  });

  it("rounds up overflow to the next billing increment", () => {
    // 31 seconds with 30s min and 10s increment -> 1s overflow -> +1 increment -> 40s total
    const result = calculateCallCost({
      durationSec: 31,
      perMinuteRate: 120,
      billingMinimumSec: 30,
      billingIncrementSec: 10,
    });

    expect(result.billableSeconds).toBe(40);
    // (40 / 60) * 120 = 80 paisa
    expect(result.costPaisa).toBe(80);
  });

  it("accurately rates long calls with non-trivial rates and ceiling round-up", () => {
    // 125 seconds duration, 30s min, 15s increment, 137 paisa/min
    // overflow = 125 - 30 = 95s
    // increments = ceil(95 / 15) = 7
    // billable = 30 + (7 * 15) = 135s (2.25 mins)
    // cost = ceil((135 / 60) * 137) = ceil(2.25 * 137) = ceil(308.25) = 309 paisa
    const result = calculateCallCost({
      durationSec: 125,
      perMinuteRate: 137,
      billingMinimumSec: 30,
      billingIncrementSec: 15,
    });

    expect(result.billableSeconds).toBe(135);
    expect(result.costPaisa).toBe(309);
  });

  it("handles billingIncrementSec of 1 (second-by-second billing above minimum)", () => {
    const result = calculateCallCost({
      durationSec: 42,
      perMinuteRate: 60, // 1 paisa / sec
      billingMinimumSec: 30,
      billingIncrementSec: 1,
    });

    expect(result.billableSeconds).toBe(42);
    expect(result.costPaisa).toBe(42);
  });
});
