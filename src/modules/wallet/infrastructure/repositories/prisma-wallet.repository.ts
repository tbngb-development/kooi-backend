import prisma from "../../../../shared/config/database/prisma";
import type {
  WalletRepository,
  CreateWalletData,
  CreditWalletData,
  DebitWalletData,
} from "../../application/interfaces/wallet-repository.interface";
import {
  computeBonusFirstDebit,
  hasSufficientBalance,
} from "../../domain/rules/bonus-first-deduction.rules";
import {
  InsufficientBalanceError,
  WalletNotFoundError,
} from "../../domain/errors/wallet.errors";
import type { Wallet, WalletTransaction } from "@prisma/client";

export class PrismaWalletRepository implements WalletRepository {
  async findByTenantId(tenantId: string): Promise<Wallet | null> {
    return prisma.wallet.findUnique({ where: { tenantId } });
  }

  async create(data: CreateWalletData): Promise<Wallet> {
    return prisma.wallet.create({
      data: {
        tenantId: data.tenantId,
        balance: data.balance ?? 0,
        bonusBalance: data.bonusBalance ?? 0,
        bonusExpiresAt: data.bonusExpiresAt ?? null,
        lowBalanceThreshold: data.lowBalanceThreshold ?? 10000,
      },
    });
  }

  async ensureWallet(tenantId: string): Promise<Wallet> {
    const existing = await this.findByTenantId(tenantId);
    if (existing) return existing;
    return this.create({ tenantId });
  }

  async credit(data: CreditWalletData): Promise<WalletTransaction> {
    return prisma.$transaction(async (tx) => {
      if (data.referenceType && data.referenceId) {
        const dup = await tx.walletTransaction.findUnique({
          where: {
            referenceType_referenceId: {
              referenceType: data.referenceType,
              referenceId: data.referenceId,
            },
          },
        });
        if (dup) return dup;
      }

      const wallet = await tx.wallet.findUnique({
        where: { tenantId: data.tenantId },
      });
      if (!wallet) throw new WalletNotFoundError(data.tenantId);

      const isBonus = data.type === "BONUS";
      const newBalance = wallet.balance + data.amount;
      const newBonusBalance = isBonus
        ? wallet.bonusBalance + data.amount
        : wallet.bonusBalance;

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          bonusBalance: newBonusBalance,
          ...(isBonus && data.bonusExpiresAt !== undefined
            ? { bonusExpiresAt: data.bonusExpiresAt }
            : {}),
          lowBalanceAlertSent: false,
        },
      });

      return tx.walletTransaction.create({
        data: {
          walletId: updated.id,
          tenantId: data.tenantId,
          type: data.type,
          amount: data.amount,
          balanceAfter: updated.balance,
          bonusBalanceAfter: updated.bonusBalance,
          description: data.description,
          referenceType: data.referenceType ?? null,
          referenceId: data.referenceId ?? null,
          createdBy: data.createdBy ?? null,
        },
      });
    });
  }

  async debit(data: DebitWalletData): Promise<WalletTransaction> {
    return prisma.$transaction(async (tx) => {
      const dup = await tx.walletTransaction.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: data.referenceType,
            referenceId: data.referenceId,
          },
        },
      });
      if (dup) return dup;

      const wallet = await tx.wallet.findUnique({
        where: { tenantId: data.tenantId },
      });
      if (!wallet) throw new WalletNotFoundError(data.tenantId);

      if (!hasSufficientBalance(wallet.balance, data.amount)) {
        throw new InsufficientBalanceError();
      }

      const split = computeBonusFirstDebit(wallet, data.amount);

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: split.newBalance,
          bonusBalance: split.newBonusBalance,
        },
      });

      return tx.walletTransaction.create({
        data: {
          walletId: updated.id,
          tenantId: data.tenantId,
          type: "DEBIT",
          amount: data.amount,
          balanceAfter: updated.balance,
          bonusBalanceAfter: updated.bonusBalance,
          description: data.description,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          createdBy: data.createdBy ?? null,
        },
      });
    });
  }

  async listTransactions(
    tenantId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: WalletTransaction[]; total: number }> {
    const skip = (opts.page - 1) * opts.limit;
    const [items, total] = await prisma.$transaction([
      prisma.walletTransaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: opts.limit,
      }),
      prisma.walletTransaction.count({ where: { tenantId } }),
    ]);
    return { items, total };
  }

  async markLowBalanceAlertSent(
    tenantId: string,
    sent: boolean,
  ): Promise<void> {
    await prisma.wallet.update({
      where: { tenantId },
      data: { lowBalanceAlertSent: sent },
    });
  }

  async setLowBalanceThreshold(
    tenantId: string,
    threshold: number,
  ): Promise<Wallet> {
    return prisma.wallet.update({
      where: { tenantId },
      data: { lowBalanceThreshold: threshold },
    });
  }
}
