import prisma from "../../../../shared/config/database/prisma";
import type { Wallet, WalletTransaction } from "@prisma/client";
import type {
  WalletRepository,
  CreateWalletData,
  CreditWalletData,
  DebitWalletData,
  ListTransactionsOptions,
} from "../../application/interfaces/wallet-repository.interface";
import {
  computeBonusFirstDeduction,
  hasAvailableBalance,
} from "../../domain/rules/bonus-first-deduction.rules";
import {
  InsufficientBalanceError,
  WalletNotFoundError,
  WalletInactiveError,
  InvalidTransactionAmountError,
} from "../../domain/errors/wallet.errors";

export class PrismaWalletRepository implements WalletRepository {
  async findByTenantId(tenantId: string): Promise<Wallet | null> {
    return prisma.wallet.findUnique({ where: { tenantId } });
  }

  async create(data: CreateWalletData): Promise<Wallet> {
    return prisma.wallet.create({
      data: {
        tenantId: data.tenantId,
        cashBalance: data.cashBalance ?? 0,
        bonusBalance: data.bonusBalance ?? 0,
        bonusExpiresAt: data.bonusExpiresAt ?? null,
        currency: data.currency ?? "INR",
      },
    });
  }

  async ensureWallet(tenantId: string): Promise<Wallet> {
    const existing = await this.findByTenantId(tenantId);
    if (existing) return existing;

    return prisma.wallet.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  /**
   * Atomic, row-locked wallet credit.
   */
  async credit(data: CreditWalletData): Promise<WalletTransaction> {
    if (!Number.isInteger(data.amount) || data.amount <= 0) {
      throw new InvalidTransactionAmountError();
    }

    return prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      if (data.idempotencyKey) {
        const existingTx = await tx.walletTransaction.findFirst({
          where: {
            tenantId: data.tenantId,
            idempotencyKey: data.idempotencyKey,
          },
        });
        if (existingTx) return existingTx;
      }

      // 2. Pessimistic Row Lock
      const wallets = await tx.$queryRaw<Wallet[]>`
        SELECT * FROM "Wallet" WHERE "tenantId" = ${data.tenantId} FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) throw new WalletNotFoundError(data.tenantId);
      if (!wallet.isActive) throw new WalletInactiveError();

      const isBonus = data.type === "BONUS" || data.targetBalance === "BONUS";
      const cashDelta = isBonus ? 0 : data.amount;
      const bonusDelta = isBonus ? data.amount : 0;

      const newCashBalance = wallet.cashBalance + cashDelta;
      const newBonusBalance = wallet.bonusBalance + bonusDelta;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          cashBalance: newCashBalance,
          bonusBalance: newBonusBalance,
          ...(isBonus && data.bonusExpiresAt !== undefined
            ? { bonusExpiresAt: data.bonusExpiresAt }
            : {}),
        },
      });

      return tx.walletTransaction.create({
        data: {
          walletId: updatedWallet.id,
          tenantId: data.tenantId,
          type: data.type,
          amount: data.amount,
          cashDelta,
          bonusDelta,
          cashBalanceAfter: updatedWallet.cashBalance,
          bonusBalanceAfter: updatedWallet.bonusBalance,
          currency: updatedWallet.currency,
          description: data.description,
          sourceType: data.sourceType ?? null,
          sourceId: data.sourceId ?? null,
          idempotencyKey: data.idempotencyKey ?? null,
          createdBy: data.createdBy ?? null,
        },
      });
    });
  }

  /**
   * Atomic, row-locked wallet debit with lazy bonus expiration.
   */
  async debit(data: DebitWalletData): Promise<WalletTransaction> {
    if (!Number.isInteger(data.amount) || data.amount <= 0) {
      throw new InvalidTransactionAmountError();
    }

    return prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      if (data.idempotencyKey) {
        const existingTx = await tx.walletTransaction.findFirst({
          where: {
            tenantId: data.tenantId,
            idempotencyKey: data.idempotencyKey,
          },
        });
        if (existingTx) return existingTx;
      }

      // 2. Pessimistic Row Lock (PostgreSQL FOR UPDATE)
      const wallets = await tx.$queryRaw<Wallet[]>`
        SELECT * FROM "Wallet" WHERE "tenantId" = ${data.tenantId} FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) throw new WalletNotFoundError(data.tenantId);
      if (!wallet.isActive) throw new WalletInactiveError();

      const now = new Date();

      // 3. Lazy Bonus Expiration Check
      const currentCash = wallet.cashBalance;
      let currentBonus = wallet.bonusBalance;

      if (
        wallet.bonusExpiresAt &&
        wallet.bonusExpiresAt <= now &&
        wallet.bonusBalance > 0
      ) {
        const expiredAmount = wallet.bonusBalance;
        currentBonus = 0;

        // Record BONUS_EXPIRY ledger entry
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            tenantId: data.tenantId,
            type: "BONUS_EXPIRY",
            amount: expiredAmount,
            cashDelta: 0,
            bonusDelta: -expiredAmount,
            cashBalanceAfter: currentCash,
            bonusBalanceAfter: 0,
            currency: wallet.currency,
            description: "Promotional bonus expired",
            sourceType: "BONUS_EXPIRY",
            sourceId: wallet.id,
            createdBy: "SYSTEM",
          },
        });
      }

      // 4. Validate Funds
      if (
        !hasAvailableBalance(
          {
            cashBalance: currentCash,
            bonusBalance: currentBonus,
            bonusExpiresAt: null,
          },
          data.amount,
          now,
        )
      ) {
        throw new InsufficientBalanceError();
      }

      // 5. Compute Deduction Split
      const split = computeBonusFirstDeduction(
        {
          cashBalance: currentCash,
          bonusBalance: currentBonus,
          bonusExpiresAt: null,
        },
        data.amount,
        now,
      );

      // 6. Mutate Wallet
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          cashBalance: split.newCashBalance,
          bonusBalance: split.newBonusBalance,
          ...(currentBonus !== wallet.bonusBalance && { bonusExpiresAt: null }),
        },
      });

      // 7. Write DEBIT Ledger Entry
      return tx.walletTransaction.create({
        data: {
          walletId: updatedWallet.id,
          tenantId: data.tenantId,
          type: "DEBIT",
          amount: data.amount,
          cashDelta: split.cashDelta,
          bonusDelta: split.bonusDelta,
          cashBalanceAfter: updatedWallet.cashBalance,
          bonusBalanceAfter: updatedWallet.bonusBalance,
          currency: updatedWallet.currency,
          description: data.description,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          idempotencyKey: data.idempotencyKey,
          createdBy: data.createdBy ?? null,
        },
      });
    });
  }

  async listTransactions(
    tenantId: string,
    opts: ListTransactionsOptions,
  ): Promise<{ items: WalletTransaction[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const where = {
      tenantId,
      ...(opts.type && { type: opts.type }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: opts.limit,
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    return { items, total };
  }
}
