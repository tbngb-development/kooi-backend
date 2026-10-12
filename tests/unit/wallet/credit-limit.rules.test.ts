import { describe, it, expect } from "vitest";
import {
  evaluateCreditLimit,
  type CreditLimitCheckInput,
} from "../../../src/modules/wallet/domain/rules/credit-limit.rules";

describe("Credit-Limit Domain Rule (Module 5 - Wallet Accounting)", () => {
  const baseWallet = {
    cashBalance: 10000, // 100 INR
    bonusBalance: 5000,  // 50 INR
    bonusExpiresAt: new Date(Date.now() + 86400000), // unexpired
  };

  it("permits execution (shouldStop: false) when funds exceed projected cost", () => {
    const input: CreditLimitCheckInput = {
      wallet: baseWallet, // 15000 paisa available
      creditLimitPaisa: 0,
      perMinuteRatePaisa: 300, // 300 * 90 / 60 = 450 paisa per call
      inFlightCallCount: 10, // 10 * 450 = 4500 paisa projected
    };

    const result = evaluateCreditLimit(input);

    expect(result.shouldStop).toBe(false);
    expect(result.availableFundsPaisa).toBe(15000);
    expect(result.projectedInFlightCostPaisa).toBe(4500);
    expect(result.remainingBufferPaisa).toBe(10500);
  });

  it("flags shouldStop: true when remaining buffer is exactly 0", () => {
    const input: CreditLimitCheckInput = {
      wallet: {
        cashBalance: 4500,
        bonusBalance: 0,
        bonusExpiresAt: null,
      },
      creditLimitPaisa: 0,
      perMinuteRatePaisa: 300, // 450 paisa per call
      inFlightCallCount: 10, // 4500 projected
    };

    const result = evaluateCreditLimit(input);

    expect(result.shouldStop).toBe(true);
    expect(result.availableFundsPaisa).toBe(4500);
    expect(result.projectedInFlightCostPaisa).toBe(4500);
    expect(result.remainingBufferPaisa).toBe(0);
  });

  it("flags shouldStop: true when projected in-flight cost exceeds available funds", () => {
    const input: CreditLimitCheckInput = {
      wallet: {
        cashBalance: 2000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      },
      creditLimitPaisa: 1000, // available = 3000
      perMinuteRatePaisa: 400, // 400 * 1.5 = 600 per call
      inFlightCallCount: 6, // 6 * 600 = 3600 projected
    };

    const result = evaluateCreditLimit(input);

    expect(result.shouldStop).toBe(true);
    expect(result.availableFundsPaisa).toBe(3000);
    expect(result.projectedInFlightCostPaisa).toBe(3600);
    expect(result.remainingBufferPaisa).toBe(-600);
  });

  it("ignores expired bonus credits when computing available funds", () => {
    const input: CreditLimitCheckInput = {
      wallet: {
        cashBalance: 1000,
        bonusBalance: 50000, // expired bonus
        bonusExpiresAt: new Date(Date.now() - 3600000),
      },
      creditLimitPaisa: 0,
      perMinuteRatePaisa: 200, // 200 * 1.5 = 300 per call
      inFlightCallCount: 5, // 5 * 300 = 1500 projected
    };

    const result = evaluateCreditLimit(input);

    // Only 1000 cash is effective
    expect(result.availableFundsPaisa).toBe(1000);
    expect(result.projectedInFlightCostPaisa).toBe(1500);
    expect(result.remainingBufferPaisa).toBe(-500);
    expect(result.shouldStop).toBe(true);
  });

  it("correctly handles zero in-flight calls", () => {
    const positiveInput: CreditLimitCheckInput = {
      wallet: { cashBalance: 500, bonusBalance: 0, bonusExpiresAt: null },
      creditLimitPaisa: 0,
      perMinuteRatePaisa: 300,
      inFlightCallCount: 0,
    };
    const positiveResult = evaluateCreditLimit(positiveInput);
    expect(positiveResult.shouldStop).toBe(false);
    expect(positiveResult.projectedInFlightCostPaisa).toBe(0);
    expect(positiveResult.remainingBufferPaisa).toBe(500);

    const zeroBalanceInput: CreditLimitCheckInput = {
      wallet: { cashBalance: 0, bonusBalance: 0, bonusExpiresAt: null },
      creditLimitPaisa: 0,
      perMinuteRatePaisa: 300,
      inFlightCallCount: 0,
    };
    const zeroResult = evaluateCreditLimit(zeroBalanceInput);
    expect(zeroResult.shouldStop).toBe(true);
    expect(zeroResult.remainingBufferPaisa).toBe(0);
  });

  it("uses Math.ceil for fractional paise in cost per call calculation", () => {
    const input: CreditLimitCheckInput = {
      wallet: { cashBalance: 1000, bonusBalance: 0, bonusExpiresAt: null },
      creditLimitPaisa: 0,
      perMinuteRatePaisa: 333, // 333 * 90 / 60 = 499.5 -> ceil = 500
      inFlightCallCount: 1,
    };

    const result = evaluateCreditLimit(input);

    expect(result.projectedInFlightCostPaisa).toBe(500);
    expect(result.remainingBufferPaisa).toBe(500);
    expect(result.shouldStop).toBe(false);
  });
});
