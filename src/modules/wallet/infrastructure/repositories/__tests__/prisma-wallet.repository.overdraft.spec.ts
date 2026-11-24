import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaWalletRepository } from "../prisma-wallet.repository";
import { InsufficientBalanceError } from "../../../domain/errors/wallet.errors";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: { $transaction: vi.fn() },
}));

const walletRow = {
  id: "w-1",
  tenantId: "tenant-1",
  cashBalance: 100,
  bonusBalance: 0,
  bonusExpiresAt: null,
  isActive: true,
  currency: "INR",
};

const baseDebit = {
  tenantId: "tenant-1",
  amount: 1_000,
  description: "AI Call call-1",
  sourceType: "CALL" as const,
  sourceId: "call-1",
  idempotencyKey: "call:call-1:default",
};

describe("PrismaWalletRepository — dispatched-call overdraft settlement", () => {
  const tx = {
    $queryRaw: vi.fn(),
    walletTransaction: { findFirst: vi.fn(), create: vi.fn() },
    wallet: { update: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: any) => callback(tx),
    );
    tx.$queryRaw.mockResolvedValue([walletRow]);
    tx.walletTransaction.findFirst.mockResolvedValue(null);
    tx.wallet.update.mockImplementation(async ({ data }: any) => ({
      ...walletRow,
      ...data,
    }));
    tx.walletTransaction.create.mockImplementation(async ({ data }: any) => ({
      id: "tx-new",
      ...data,
    }));
  });

  it("settles a call debit into negative balance when overdraft is allowed", async () => {
    const repo = new PrismaWalletRepository();

    const result = await repo.debit({ ...baseDebit, allowOverdraft: true });

    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { id: walletRow.id },
      data: expect.objectContaining({ cashBalance: -900, bonusBalance: 0 }),
    });
    expect(result).toMatchObject({
      type: "DEBIT",
      amount: 1_000,
      cashDelta: -1_000,
      bonusDelta: 0,
      cashBalanceAfter: -900,
      bonusBalanceAfter: 0,
    });
  });

  it("allows overdraft by default for CALL-sourced debits", async () => {
    const repo = new PrismaWalletRepository();

    await expect(repo.debit(baseDebit)).resolves.toMatchObject({
      cashBalanceAfter: -900,
    });
    expect(tx.wallet.update).toHaveBeenCalled();
  });

  it("still rejects a debit without sufficient funds when overdraft is not allowed", async () => {
    const repo = new PrismaWalletRepository();

    await expect(
      repo.debit({
        ...baseDebit,
        sourceType: "ADMIN_ADJUSTMENT",
        allowOverdraft: false,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("does not double-settle a replayed idempotency key", async () => {
    const existing = { id: "tx-existing" };
    tx.walletTransaction.findFirst.mockResolvedValue(existing);
    const repo = new PrismaWalletRepository();

    const result = await repo.debit({ ...baseDebit, allowOverdraft: true });

    expect(result).toBe(existing);
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });
});
