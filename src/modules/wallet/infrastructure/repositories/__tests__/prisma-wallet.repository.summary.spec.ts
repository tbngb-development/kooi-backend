import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaWalletRepository } from "../prisma-wallet.repository";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    wallet: { findUnique: vi.fn() },
    walletTransaction: { aggregate: vi.fn() },
  },
}));

const mockedPrisma = prisma as any;

describe("PrismaWalletRepository transaction summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedPrisma.wallet.findUnique.mockResolvedValue({
      id: "w-1",
      tenantId: "tenant-1",
      cashBalance: 840000,
      bonusBalance: 0,
      bonusExpiresAt: null,
      currency: "INR",
      isActive: true,
    });

    mockedPrisma.walletTransaction.aggregate.mockImplementation(
      async (args: any) => {
        const where = args.where ?? {};

        if (where.sourceType === "RECHARGE") {
          return { _sum: { cashDelta: 2023400, bonusDelta: 0 } };
        }
        if (where.NOT?.sourceType === "RECHARGE") {
          return { _sum: { cashDelta: 120000, bonusDelta: 81900 } };
        }
        if (where.type === "BONUS_EXPIRY") {
          return { _sum: { amount: 0 } };
        }
        if (where.type === "DEBIT" && where.sourceType === "CALL") {
          return { _sum: { amount: 2386200 } };
        }
        if (where.type === "DEBIT" && where.NOT?.sourceType === "CALL") {
          return { _sum: { amount: 39100 } };
        }
        if (where.type === "DEBIT") {
          return { _sum: { amount: 2425300 } };
        }

        throw new Error(`Unexpected aggregate call: ${JSON.stringify(args)}`);
      },
    );
  });

  it("reports purchased, call, other, and expired credit movements separately", async () => {
    const result = await new PrismaWalletRepository().getTransactionSummary(
      "tenant-1",
    );

    expect(result).toMatchObject({
      totalPurchasedCreditsPaisa: 2023400,
      totalCallSpendPaisa: 2386200,
      totalOtherDebitsPaisa: 39100,
      totalBonusExpiredPaisa: 0,
      totalCreditsAddedPaisa: 201900,
      totalCreditsUsedPaisa: 2425300,
      cashBalance: 840000,
      bonusBalance: 0,
    });
  });
});
