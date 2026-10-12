import { describe, it, expect } from "vitest";
import {
  computeBonusFirstDeduction,
  hasAvailableBalance,
  getEffectiveAvailableBalance,
  type WalletBalances,
} from "../../../src/modules/wallet/domain/rules/bonus-first-deduction.rules";

describe("Bonus-First Deduction Domain Rule (Module 5 - Wallet Accounting)", () => {
  const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);

  describe("computeBonusFirstDeduction", () => {
    it("returns zero deltas when debit amount is zero or negative", () => {
      const wallet: WalletBalances = {
        cashBalance: 5000,
        bonusBalance: 2000,
        bonusExpiresAt: futureExpiry,
      };

      const resultZero = computeBonusFirstDeduction(wallet, 0);
      expect(resultZero).toEqual({
        hasExpiredBonus: false,
        expiredBonusAmount: 0,
        fromBonus: 0,
        fromCash: 0,
        newCashBalance: 5000,
        newBonusBalance: 2000,
        cashDelta: 0,
        bonusDelta: 0,
      });

      const resultNeg = computeBonusFirstDeduction(wallet, -500);
      expect(resultNeg.fromBonus).toBe(0);
      expect(resultNeg.fromCash).toBe(0);
    });

    it("consumes 100% from unexpired bonus when bonus covers the full debit amount", () => {
      const wallet: WalletBalances = {
        cashBalance: 10000,
        bonusBalance: 5000,
        bonusExpiresAt: futureExpiry,
      };

      const result = computeBonusFirstDeduction(wallet, 3000);

      expect(result.hasExpiredBonus).toBe(false);
      expect(result.expiredBonusAmount).toBe(0);
      expect(result.fromBonus).toBe(3000);
      expect(result.fromCash).toBe(0);
      expect(result.newBonusBalance).toBe(2000);
      expect(result.newCashBalance).toBe(10000);
      expect(result.bonusDelta).toBe(-3000);
      expect(result.cashDelta).toBe(0);
    });

    it("consumes all unexpired bonus first and takes remainder from cash", () => {
      const wallet: WalletBalances = {
        cashBalance: 10000,
        bonusBalance: 2000,
        bonusExpiresAt: futureExpiry,
      };

      const result = computeBonusFirstDeduction(wallet, 5000);

      expect(result.hasExpiredBonus).toBe(false);
      expect(result.expiredBonusAmount).toBe(0);
      expect(result.fromBonus).toBe(2000);
      expect(result.fromCash).toBe(3000);
      expect(result.newBonusBalance).toBe(0);
      expect(result.newCashBalance).toBe(7000);
      expect(result.bonusDelta).toBe(-2000);
      expect(result.cashDelta).toBe(-3000);
    });

    it("disallows expired bonus, marks hasExpiredBonus = true, and deducts 100% from cash", () => {
      const wallet: WalletBalances = {
        cashBalance: 10000,
        bonusBalance: 4000,
        bonusExpiresAt: pastExpiry,
      };

      const result = computeBonusFirstDeduction(wallet, 3000);

      expect(result.hasExpiredBonus).toBe(true);
      expect(result.expiredBonusAmount).toBe(4000);
      expect(result.fromBonus).toBe(0);
      expect(result.fromCash).toBe(3000);
      expect(result.newBonusBalance).toBe(0);
      expect(result.newCashBalance).toBe(7000);
      expect(result.bonusDelta).toBe(0);
      expect(result.cashDelta).toBe(-3000);
    });

    it("deducts 100% from cash when wallet has zero bonus balance", () => {
      const wallet: WalletBalances = {
        cashBalance: 8000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      };

      const result = computeBonusFirstDeduction(wallet, 2500);

      expect(result.hasExpiredBonus).toBe(false);
      expect(result.expiredBonusAmount).toBe(0);
      expect(result.fromBonus).toBe(0);
      expect(result.fromCash).toBe(2500);
      expect(result.newBonusBalance).toBe(0);
      expect(result.newCashBalance).toBe(5500);
      expect(result.bonusDelta).toBe(0);
      expect(result.cashDelta).toBe(-2500);
    });
  });

  describe("hasAvailableBalance", () => {
    it("returns true for zero or negative amount", () => {
      const wallet: WalletBalances = {
        cashBalance: 0,
        bonusBalance: 0,
        bonusExpiresAt: null,
      };
      expect(hasAvailableBalance(wallet, 0)).toBe(true);
      expect(hasAvailableBalance(wallet, -10)).toBe(true);
    });

    it("returns true when combined cash + valid bonus is sufficient", () => {
      const wallet: WalletBalances = {
        cashBalance: 3000,
        bonusBalance: 2000,
        bonusExpiresAt: futureExpiry,
      };
      expect(hasAvailableBalance(wallet, 5000)).toBe(true);
      expect(hasAvailableBalance(wallet, 4999)).toBe(true);
    });

    it("returns false when combined cash + valid bonus is insufficient", () => {
      const wallet: WalletBalances = {
        cashBalance: 3000,
        bonusBalance: 2000,
        bonusExpiresAt: futureExpiry,
      };
      expect(hasAvailableBalance(wallet, 5001)).toBe(false);
    });

    it("ignores expired bonus balance when determining availability", () => {
      const wallet: WalletBalances = {
        cashBalance: 3000,
        bonusBalance: 5000,
        bonusExpiresAt: pastExpiry, // Expired!
      };
      // Only 3000 cash is usable
      expect(hasAvailableBalance(wallet, 3000)).toBe(true);
      expect(hasAvailableBalance(wallet, 3001)).toBe(false);
    });
  });

  describe("getEffectiveAvailableBalance", () => {
    it("returns combined sum of cash and valid bonus", () => {
      const wallet: WalletBalances = {
        cashBalance: 4500,
        bonusBalance: 1500,
        bonusExpiresAt: futureExpiry,
      };
      expect(getEffectiveAvailableBalance(wallet)).toBe(6000);
    });

    it("excludes expired bonus from effective available balance", () => {
      const wallet: WalletBalances = {
        cashBalance: 4500,
        bonusBalance: 1500,
        bonusExpiresAt: pastExpiry,
      };
      expect(getEffectiveAvailableBalance(wallet)).toBe(4500);
    });
  });
});
