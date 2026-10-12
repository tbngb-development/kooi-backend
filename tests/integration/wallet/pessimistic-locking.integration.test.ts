import { describe, it, expect, beforeEach, afterAll } from "vitest";
import prisma from "../../../src/shared/config/database/prisma";
import { PrismaWalletRepository } from "../../../src/modules/wallet/infrastructure/repositories/prisma-wallet.repository";
import { clearTestDatabase, disconnectTestDatabase } from "../../setup/db-test-client";
import { InsufficientBalanceError } from "../../../src/modules/wallet/domain/errors/wallet.errors";

describe("Wallet Concurrency, Pessimistic Locking & Financial Ledger Integration", () => {
  const walletRepo = new PrismaWalletRepository();
  const tenantId = "11111111-2222-4333-8444-555555555555";

  beforeEach(async () => {
    await clearTestDatabase();

    // Create prerequisite tenant record
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "Ledger Test Tenant",
        email: "ledger-test@example.com",
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  it("handles 10 concurrent debit requests deterministically with pessimistic locking and zero lost updates", async () => {
    // 1. Seed wallet with ₹1,000 (100,000 paisa)
    await walletRepo.create({
      tenantId,
      cashBalance: 100000,
      bonusBalance: 0,
      currency: "INR",
    });

    // 2. Concurrently fire 10 debits of ₹50 (5,000 paisa) each
    const debits = Array.from({ length: 10 }).map((_, index) =>
      walletRepo.debit({
        tenantId,
        amount: 5000,
        description: `Concurrent call debit ${index}`,
        sourceType: "CALL",
        sourceId: `call-concurrent-${index}`,
        idempotencyKey: `idem-concurrent-${index}`,
      }),
    );

    const results = await Promise.all(debits);

    // 3. Verify all 10 operations resolved successfully
    expect(results).toHaveLength(10);

    // 4. Verify wallet balance in DB is exactly 100,000 - (10 * 5,000) = 50,000
    const finalWallet = await prisma.wallet.findUnique({
      where: { tenantId },
    });
    expect(finalWallet).not.toBeNull();
    expect(finalWallet!.cashBalance).toBe(50000);
    expect(finalWallet!.bonusBalance).toBe(0);

    // 5. Verify all 10 transaction records exist in the ledger
    const ledgerEntries = await prisma.walletTransaction.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    expect(ledgerEntries).toHaveLength(10);

    // 6. Verify ledger integrity: sum of cash deltas matches the balance delta
    const totalCashDelta = ledgerEntries.reduce((sum, tx) => sum + tx.cashDelta, 0);
    expect(totalCashDelta).toBe(-50000);
  });

  it("protects against duplicate debit double-charging via idempotency keys", async () => {
    await walletRepo.create({
      tenantId,
      cashBalance: 50000,
      bonusBalance: 0,
      currency: "INR",
    });

    const idempotencyKey = "call-idempotency-key-alpha-99";

    // First debit attempt
    const firstTx = await walletRepo.debit({
      tenantId,
      amount: 4000,
      description: "AI Call billable debit",
      sourceType: "CALL",
      sourceId: "call-99",
      idempotencyKey,
    });

    // Immediate replay of identical debit with identical idempotencyKey
    const secondTx = await walletRepo.debit({
      tenantId,
      amount: 4000,
      description: "AI Call billable debit duplicate request",
      sourceType: "CALL",
      sourceId: "call-99",
      idempotencyKey,
    });

    // Both invocations return the exact same transaction ID
    expect(secondTx.id).toBe(firstTx.id);
    expect(secondTx.amount).toBe(4000);

    // Database check: wallet debited only once (50,000 - 4,000 = 46,000)
    const wallet = await prisma.wallet.findUnique({ where: { tenantId } });
    expect(wallet!.cashBalance).toBe(46000);

    // Only one ledger row exists
    const txCount = await prisma.walletTransaction.count({
      where: { tenantId, idempotencyKey },
    });
    expect(txCount).toBe(1);
  });

  it("performs lazy bonus expiration during debit when bonus timestamp is in the past", async () => {
    // Seed wallet with unexpired cash and expired bonus
    const oneHourAgo = new Date(Date.now() - 3600000);
    await walletRepo.create({
      tenantId,
      cashBalance: 10000, // 100 INR cash
      bonusBalance: 5000,  // 50 INR expired bonus
      bonusExpiresAt: oneHourAgo,
      currency: "INR",
    });

    // Perform debit of 3,000 paisa
    const debitTx = await walletRepo.debit({
      tenantId,
      amount: 3000,
      description: "Call debit after bonus expired",
      sourceType: "CALL",
      sourceId: "call-lazy-expiry",
      idempotencyKey: "lazy-expiry-key-1",
    });

    // The debit must have been taken 100% from cash, NOT expired bonus
    expect(debitTx.cashDelta).toBe(-3000);
    expect(debitTx.bonusDelta).toBe(0);
    expect(debitTx.cashBalanceAfter).toBe(7000);
    expect(debitTx.bonusBalanceAfter).toBe(0);

    // Wallet in DB must reflect zero bonus balance and cleared expiry timestamp
    const wallet = await prisma.wallet.findUnique({ where: { tenantId } });
    expect(wallet!.cashBalance).toBe(7000);
    expect(wallet!.bonusBalance).toBe(0);
    expect(wallet!.bonusExpiresAt).toBeNull();

    // Two transactions recorded in ledger: BONUS_EXPIRY first, then DEBIT
    const txs = await prisma.walletTransaction.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    expect(txs).toHaveLength(2);

    expect(txs[0].type).toBe("BONUS_EXPIRY");
    expect(txs[0].amount).toBe(5000);
    expect(txs[0].bonusDelta).toBe(-5000);
    expect(txs[0].cashDelta).toBe(0);

    expect(txs[1].type).toBe("DEBIT");
    expect(txs[1].amount).toBe(3000);
  });

  it("permits overdraft for voice calls while forbidding overdraft for non-call sources", async () => {
    await walletRepo.create({
      tenantId,
      cashBalance: 1000, // only 10 INR available
      bonusBalance: 0,
      currency: "INR",
    });

    // Voice call debit for 2,500 paisa (exceeds balance by 1,500)
    const callTx = await walletRepo.debit({
      tenantId,
      amount: 2500,
      description: "Completed call settle with overdraft",
      sourceType: "CALL",
      sourceId: "call-overdraft-1",
      idempotencyKey: "call-overdraft-tx",
    });

    expect(callTx.cashBalanceAfter).toBe(-1500);

    const walletAfterCall = await prisma.wallet.findUnique({ where: { tenantId } });
    expect(walletAfterCall!.cashBalance).toBe(-1500);

    // Non-call debit without overdraft permission must fail immediately
    await expect(
      walletRepo.debit({
        tenantId,
        amount: 500,
        description: "Manual adjustment without overdraft",
        sourceType: "ADMIN_ADJUSTMENT",
        sourceId: "admin-adj-1",
        idempotencyKey: "admin-adj-tx-fail",
        allowOverdraft: false,
      }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  it("executes expireBonus atomically and idempotently", async () => {
    const expiredAt = new Date(Date.now() - 100000);
    await walletRepo.create({
      tenantId,
      cashBalance: 20000,
      bonusBalance: 8000,
      bonusExpiresAt: expiredAt,
      currency: "INR",
    });

    // Concurrent executions of expireBonus
    const [result1, result2] = await Promise.all([
      walletRepo.expireBonus(tenantId),
      walletRepo.expireBonus(tenantId),
    ]);

    // One of them performs the expiry, the second returns null or existing transaction
    const successfulTx = result1 ?? result2;
    expect(successfulTx).not.toBeNull();
    expect(successfulTx!.type).toBe("BONUS_EXPIRY");
    expect(successfulTx!.amount).toBe(8000);

    // Only one BONUS_EXPIRY ledger entry is created
    const expiryTxs = await prisma.walletTransaction.findMany({
      where: { tenantId, type: "BONUS_EXPIRY" },
    });
    expect(expiryTxs).toHaveLength(1);

    // Wallet bonus balance is zeroed
    const wallet = await prisma.wallet.findUnique({ where: { tenantId } });
    expect(wallet!.bonusBalance).toBe(0);
    expect(wallet!.bonusExpiresAt).toBeNull();
    expect(wallet!.cashBalance).toBe(20000);
  });
});
