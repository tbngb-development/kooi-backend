import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListTransactionsUseCase } from "../application/use-cases/list-transactions.use-case";
import { GetWalletSummaryUseCase } from "../application/use-cases/get-wallet-summary.use-case";
import { GetTransactionDetailUseCase } from "../application/use-cases/get-transaction-detail.use-case";
import type { WalletRepository } from "../application/interfaces/wallet-repository.interface";
import type { WalletTransaction } from "@prisma/client";
import { AppError } from "../../../shared/errors";

describe("Tenant Wallet Separation & Summary", () => {
  let mockWalletRepo: WalletRepository;

  beforeEach(() => {
    mockWalletRepo = {
      findByTenantId: vi.fn(),
      ensureWallet: vi.fn(),
      create: vi.fn(),
      credit: vi.fn(),
      debit: vi.fn(),
      listTransactions: vi.fn(),
      getTransactionSummary: vi.fn(),
      findTransactionByIdAndTenant: vi.fn(),
      findWalletsWithExpiredBonus: vi.fn(),
      expireBonus: vi.fn(),
      findTransactionByIdempotencyKey: vi.fn(),
    };
  });

  describe("ListTransactionsUseCase", () => {
    it("should pass excludeRecharge: true when requested to isolate ledger from topups", async () => {
      const useCase = new ListTransactionsUseCase(mockWalletRepo);

      vi.mocked(mockWalletRepo.listTransactions).mockResolvedValue({
        items: [],
        total: 0,
      });

      await useCase.execute("tenant_123", {
        page: 1,
        limit: 20,
        excludeRecharge: true,
        search: "CALL_999",
      });

      expect(mockWalletRepo.listTransactions).toHaveBeenCalledWith(
        "tenant_123",
        expect.objectContaining({
          excludeRecharge: true,
          search: "CALL_999",
        }),
      );
    });
  });

  describe("GetWalletSummaryUseCase", () => {
    it("should return all-time summary metrics strictly excluding recharge from additions", async () => {
      const useCase = new GetWalletSummaryUseCase(mockWalletRepo);

      vi.mocked(mockWalletRepo.getTransactionSummary).mockResolvedValue({
        totalCreditsAddedPaisa: 30000,
        totalCreditsUsedPaisa: 45000,
        cashBalance: 15000,
        bonusBalance: 5000,
      });

      const result = await useCase.execute("tenant_123");

      expect(mockWalletRepo.getTransactionSummary).toHaveBeenCalledWith("tenant_123");
      expect(result.totalCreditsAddedPaisa).toBe(30000);
      expect(result.totalCreditsUsedPaisa).toBe(45000);
      expect(result.cashBalance).toBe(15000);
      expect(result.bonusBalance).toBe(5000);
    });
  });

  describe("GetTransactionDetailUseCase", () => {
    it("should return transaction detail and accurately calculate before balances", async () => {
      const useCase = new GetTransactionDetailUseCase(mockWalletRepo);

      const fakeTx: WalletTransaction = {
        id: "tx_100",
        walletId: "wal_1",
        tenantId: "tenant_123",
        type: "DEBIT",
        amount: 2500,
        cashDelta: -1500,
        bonusDelta: -1000,
        cashBalanceAfter: 8500,
        bonusBalanceAfter: 4000,
        currency: "INR",
        description: "Call usage deduction",
        sourceType: "CALL",
        sourceId: "call_abc_123",
        idempotencyKey: "call_abc_123",
        createdAt: new Date("2026-11-01T13:00:00Z"),
        createdBy: "SYSTEM",
      };

      vi.mocked(mockWalletRepo.findTransactionByIdAndTenant).mockResolvedValue(fakeTx);

      const result = await useCase.execute("tx_100", "tenant_123");

      expect(result.id).toBe("tx_100");
      // cashBalanceBefore = cashBalanceAfter - cashDelta = 8500 - (-1500) = 10000
      expect(result.cashBalanceBefore).toBe(10000);
      // bonusBalanceBefore = bonusBalanceAfter - bonusDelta = 4000 - (-1000) = 5000
      expect(result.bonusBalanceBefore).toBe(5000);
      expect(result.cashBalanceAfter).toBe(8500);
      expect(result.bonusBalanceAfter).toBe(4000);
    });

    it("should throw 404 AppError when transaction is not found or belongs to another tenant", async () => {
      const useCase = new GetTransactionDetailUseCase(mockWalletRepo);

      vi.mocked(mockWalletRepo.findTransactionByIdAndTenant).mockResolvedValue(null);

      await expect(
        useCase.execute("tx_100", "tenant_attacker"),
      ).rejects.toThrow(AppError);
    });
  });
});

