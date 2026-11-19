import { describe, it, expect, vi } from "vitest";
import { CheckBalanceForBatchUseCase } from "../check-balance-for-batch.use-case";
import type { WalletRepository } from "../../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../../plans/application/interfaces/plan-repository.interface";
import type { Logger } from "../../../../../shared/logging/logger.interface";
import { InsufficientBalanceError } from "../../../domain/errors/wallet.errors";

/**
 * U-02: `credit_limit` is an estimate/warning input only. A zero (or negative)
 * effective wallet balance must block batch execution regardless of how large
 * the plan's credit limit is.
 */
describe("CheckBalanceForBatchUseCase — zero-balance execution gate", () => {
  const makeUseCase = ({
    cashBalance,
    bonusBalance = 0,
    bonusExpiresAt = null as Date | null,
    creditLimit = 50_000,
  }: {
    cashBalance: number;
    bonusBalance?: number;
    bonusExpiresAt?: Date | null;
    creditLimit?: number;
  }) => {
    const walletRepo = {
      ensureWallet: vi.fn().mockResolvedValue({
        id: "w-1",
        tenantId: "tenant-1",
        cashBalance,
        bonusBalance,
        bonusExpiresAt,
      }),
    } as unknown as WalletRepository;

    const planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        lowBalanceThreshold: creditLimit,
        perMinuteRate: 100,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      }),
    } as unknown as PlanRepository;

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    return new CheckBalanceForBatchUseCase(walletRepo, planRepo, logger);
  };

  it("rejects batch execution when balance is exactly 0 even with a positive credit limit", async () => {
    const useCase = makeUseCase({ cashBalance: 0, creditLimit: 50_000 });

    await expect(
      useCase.execute({ tenantId: "tenant-1", leadCount: 10 }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it("rejects batch execution when balance is negative even with a positive credit limit", async () => {
    const useCase = makeUseCase({ cashBalance: -1, creditLimit: 50_000 });

    await expect(
      useCase.execute({ tenantId: "tenant-1", leadCount: 10 }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it("still allows batch execution when effective balance is strictly positive", async () => {
    const useCase = makeUseCase({ cashBalance: 100, creditLimit: 50_000 });

    await expect(
      useCase.execute({ tenantId: "tenant-1", leadCount: 10 }),
    ).resolves.toMatchObject({ ok: true });
  });
});
