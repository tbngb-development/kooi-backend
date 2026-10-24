import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdjustWalletUseCase } from "../application/use-cases/adjust-wallet.use-case";
import { ListTransactionsUseCase } from "../application/use-cases/list-transactions.use-case";
import {
  adjustWalletSchema,
  listTransactionsQuerySchema,
} from "../presentation/wallet.schema";
import type { WalletRepository } from "../application/interfaces/wallet-repository.interface";
import type { Logger } from "../../../shared/logging/logger.interface";
import { InsufficientBalanceError } from "../domain/errors/wallet.errors";
import type { WalletTransaction } from "@prisma/client";

describe("Admin Wallet Module — Unit Tests", () => {
  let mockWalletRepo: WalletRepository;
  let mockLogger: Logger;

  const mockTx: WalletTransaction = {
    id: "tx-12345",
    walletId: "wallet-111",
    tenantId: "tenant-aaa",
    type: "CREDIT",
    amount: 50000,
    cashDelta: 50000,
    bonusDelta: 0,
    cashBalanceAfter: 150000,
    bonusBalanceAfter: 0,
    currency: "INR",
    description: "Manual enterprise credit test",
    sourceType: "ADMIN_ADJUSTMENT",
    sourceId: "admin_user-admin-1",
    idempotencyKey: "idem_custom_key_001",
    createdAt: new Date("2026-10-24T09:00:00Z"),
    createdBy: "user-admin-1",
  };

  beforeEach(() => {
    mockWalletRepo = {
      findByTenantId: vi.fn(),
      ensureWallet: vi.fn().mockResolvedValue({
        id: "wallet-111",
        tenantId: "tenant-aaa",
        cashBalance: 100000,
        bonusBalance: 0,
        bonusExpiresAt: null,
        currency: "INR",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      create: vi.fn(),
      credit: vi.fn().mockResolvedValue(mockTx),
      debit: vi.fn().mockResolvedValue({
        ...mockTx,
        type: "DEBIT",
        cashDelta: -20000,
        cashBalanceAfter: 80000,
      }),
      listTransactions: vi.fn().mockResolvedValue({
        items: [mockTx],
        total: 1,
      }),
      findWalletsWithExpiredBonus: vi.fn(),
      expireBonus: vi.fn(),
      findTransactionByIdempotencyKey: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  });

  describe("AdjustWalletUseCase", () => {
    it("should execute credit adjustment with client idempotencyKey and admin attribution", async () => {
      const useCase = new AdjustWalletUseCase(mockWalletRepo, mockLogger);

      const result = await useCase.execute(
        {
          tenantId: "tenant-aaa",
          amount: 50000,
          type: "CREDIT",
          targetBalance: "CASH",
          description: "Manual enterprise credit test",
          idempotencyKey: "idem_custom_key_001",
        },
        "user-admin-1",
      );

      expect(mockWalletRepo.ensureWallet).toHaveBeenCalledWith("tenant-aaa");
      expect(mockWalletRepo.credit).toHaveBeenCalledWith({
        tenantId: "tenant-aaa",
        amount: 50000,
        type: "CREDIT",
        targetBalance: "CASH",
        description: "Manual enterprise credit test",
        sourceType: "ADMIN_ADJUSTMENT",
        sourceId: "admin_user-admin-1",
        idempotencyKey: "idem_custom_key_001",
        createdBy: "user-admin-1",
        bonusExpiresAt: undefined,
      });

      expect(result.id).toBe("tx-12345");
      expect(result.createdBy).toBe("user-admin-1");
      expect(result.cashBalanceAfter).toBe(150000);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Admin wallet adjustment (credit)",
        expect.objectContaining({
          tenantId: "tenant-aaa",
          adminUserId: "user-admin-1",
        }),
      );
    });

    it("should pass allowOverdraft: false on DEBIT to enforce strict balance check", async () => {
      const useCase = new AdjustWalletUseCase(mockWalletRepo, mockLogger);

      await useCase.execute(
        {
          tenantId: "tenant-aaa",
          amount: 20000,
          type: "DEBIT",
          description: "Administrative balance deduction",
          idempotencyKey: "idem_debit_001",
        },
        "user-admin-1",
      );

      expect(mockWalletRepo.debit).toHaveBeenCalledWith({
        tenantId: "tenant-aaa",
        amount: 20000,
        description: "Administrative balance deduction",
        sourceType: "ADMIN_ADJUSTMENT",
        sourceId: "admin_user-admin-1",
        idempotencyKey: "idem_debit_001",
        createdBy: "user-admin-1",
        allowOverdraft: false,
      });
    });

    it("should propagate InsufficientBalanceError when debit exceeds available balance", async () => {
      (mockWalletRepo.debit as any).mockRejectedValueOnce(
        new InsufficientBalanceError(),
      );

      const useCase = new AdjustWalletUseCase(mockWalletRepo, mockLogger);

      await expect(
        useCase.execute(
          {
            tenantId: "tenant-aaa",
            amount: 9999999,
            type: "DEBIT",
            description: "Excessive debit request",
          },
          "user-admin-1",
        ),
      ).rejects.toThrow(InsufficientBalanceError);
    });
  });

  describe("ListTransactionsUseCase", () => {
    it("should forward type, sourceType, and date range filters to repository", async () => {
      const useCase = new ListTransactionsUseCase(mockWalletRepo);

      const startDateStr = "2026-10-01T00:00:00.000Z";
      const endDateStr = "2026-10-24T23:59:59.000Z";

      const res = await useCase.execute("tenant-aaa", {
        page: 2,
        limit: 10,
        type: "CREDIT",
        sourceType: "RECHARGE",
        startDate: startDateStr,
        endDate: endDateStr,
      });

      expect(mockWalletRepo.listTransactions).toHaveBeenCalledWith("tenant-aaa", {
        page: 2,
        limit: 10,
        type: "CREDIT",
        sourceType: "RECHARGE",
        startDate: new Date(startDateStr),
        endDate: new Date(endDateStr),
      });

      expect(res.page).toBe(2);
      expect(res.limit).toBe(10);
      expect(res.items[0].createdBy).toBe("user-admin-1");
      expect(res.items[0].sourceType).toBe("ADMIN_ADJUSTMENT");
    });
  });

  describe("Zod Validation Schemas", () => {
    it("should validate a valid adjustWalletSchema payload with idempotencyKey", () => {
      const parsed = adjustWalletSchema.safeParse({
        tenantId: "267cdddd-218e-46d9-86a9-22f95ab424f1",
        amount: 10000,
        type: "CREDIT",
        targetBalance: "CASH",
        description: "Standard topup adjustment",
        idempotencyKey: "uuid-idemp-12345",
      });

      expect(parsed.success).toBe(true);
    });

    it("should reject adjustWalletSchema if reason is under 5 characters", () => {
      const parsed = adjustWalletSchema.safeParse({
        tenantId: "267cdddd-218e-46d9-86a9-22f95ab424f1",
        amount: 10000,
        type: "CREDIT",
        description: "Bad",
      });

      expect(parsed.success).toBe(false);
    });

    it("should validate listTransactionsQuerySchema with filters and coercion", () => {
      const parsed = listTransactionsQuerySchema.safeParse({
        page: "3",
        limit: "25",
        type: "DEBIT",
        sourceType: "CALL",
        startDate: "2026-10-01T00:00:00.000Z",
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(3);
        expect(parsed.data.limit).toBe(25);
        expect(parsed.data.type).toBe("DEBIT");
        expect(parsed.data.sourceType).toBe("CALL");
      }
    });
  });
});
