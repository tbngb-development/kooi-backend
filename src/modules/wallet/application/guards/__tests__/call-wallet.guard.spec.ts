import { describe, it, expect, vi } from "vitest";
import { CallWalletGuard } from "../call-wallet.guard";
import type { WalletRepository } from "../../interfaces/wallet-repository.interface";
import {
  WalletNotFoundError,
  InsufficientBalanceError,
} from "../../../domain/errors/wallet.errors";

describe("CallWalletGuard", () => {
  const createMockWalletRepo = (walletData: any = null): WalletRepository =>
    ({
      findByTenantId: vi.fn().mockResolvedValue(walletData),
    }) as unknown as WalletRepository;

  describe("hasSufficientBalance", () => {
    it("returns false if wallet is not found", async () => {
      const repo = createMockWalletRepo(null);
      const guard = new CallWalletGuard(repo);

      const result = await guard.hasSufficientBalance("tenant-1");
      expect(result).toBe(false);
      expect(repo.findByTenantId).toHaveBeenCalledWith("tenant-1");
    });

    it("returns false if wallet has 0 cash and 0 bonus", async () => {
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 0,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });
      const guard = new CallWalletGuard(repo);

      const result = await guard.hasSufficientBalance("tenant-1");
      expect(result).toBe(false);
    });

    it("returns false if cash is 0 and bonus is expired", async () => {
      const pastDate = new Date(Date.now() - 10000);
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 0,
        bonusBalance: 5000,
        bonusExpiresAt: pastDate,
      });
      const guard = new CallWalletGuard(repo);

      const result = await guard.hasSufficientBalance("tenant-1");
      expect(result).toBe(false);
    });

    it("returns true if cashBalance is positive", async () => {
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 1000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });
      const guard = new CallWalletGuard(repo);

      const result = await guard.hasSufficientBalance("tenant-1");
      expect(result).toBe(true);
    });

    it("returns true if cash is 0 but unexpired bonus is positive", async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 0,
        bonusBalance: 2000,
        bonusExpiresAt: futureDate,
      });
      const guard = new CallWalletGuard(repo);

      const result = await guard.hasSufficientBalance("tenant-1");
      expect(result).toBe(true);
    });
  });

  describe("assertSufficientBalance", () => {
    it("throws WalletNotFoundError when wallet is null", async () => {
      const repo = createMockWalletRepo(null);
      const guard = new CallWalletGuard(repo);

      await expect(guard.assertSufficientBalance("tenant-missing")).rejects.toThrow(
        WalletNotFoundError,
      );
    });

    it("throws InsufficientBalanceError when balance is 0", async () => {
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 0,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });
      const guard = new CallWalletGuard(repo);

      await expect(guard.assertSufficientBalance("tenant-1")).rejects.toThrow(
        InsufficientBalanceError,
      );
    });

    it("throws InsufficientBalanceError when bonus has expired and cash is 0", async () => {
      const pastDate = new Date(Date.now() - 5000);
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 0,
        bonusBalance: 10000,
        bonusExpiresAt: pastDate,
      });
      const guard = new CallWalletGuard(repo);

      await expect(guard.assertSufficientBalance("tenant-1")).rejects.toThrow(
        InsufficientBalanceError,
      );
    });

    it("resolves successfully without throwing when cash balance > 0", async () => {
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 5000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });
      const guard = new CallWalletGuard(repo);

      await expect(guard.assertSufficientBalance("tenant-1")).resolves.toBeUndefined();
    });

    it("resolves successfully when cash is 0 but bonus is active", async () => {
      const futureDate = new Date(Date.now() + 500000);
      const repo = createMockWalletRepo({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance: 0,
        bonusBalance: 2500,
        bonusExpiresAt: futureDate,
      });
      const guard = new CallWalletGuard(repo);

      await expect(guard.assertSufficientBalance("tenant-1")).resolves.toBeUndefined();
    });
  });
});
