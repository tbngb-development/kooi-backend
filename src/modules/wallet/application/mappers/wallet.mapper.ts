import type { Wallet, WalletTransaction } from "@prisma/client";
import type {
  WalletResponse,
  WalletTransactionResponse,
} from "../dto/wallet.dto";
import { getEffectiveAvailableBalance } from "../../domain/rules/bonus-first-deduction.rules";

export function toWalletResponse(wallet: Wallet): WalletResponse {
  const totalBalance = getEffectiveAvailableBalance({
    cashBalance: wallet.cashBalance,
    bonusBalance: wallet.bonusBalance,
    bonusExpiresAt: wallet.bonusExpiresAt,
  });

  return {
    id: wallet.id,
    tenantId: wallet.tenantId,
    cashBalance: wallet.cashBalance,
    bonusBalance: wallet.bonusBalance,
    totalBalance,
    bonusExpiresAt: wallet.bonusExpiresAt?.toISOString() ?? null,
    currency: wallet.currency,
    isActive: wallet.isActive,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export function toWalletTransactionResponse(
  tx: WalletTransaction,
): WalletTransactionResponse {
  return {
    id: tx.id,
    walletId: tx.walletId,
    tenantId: tx.tenantId,
    type: tx.type,
    amount: tx.amount,
    cashDelta: tx.cashDelta,
    bonusDelta: tx.bonusDelta,
    cashBalanceAfter: tx.cashBalanceAfter,
    bonusBalanceAfter: tx.bonusBalanceAfter,
    currency: tx.currency,
    description: tx.description,
    sourceType: tx.sourceType,
    sourceId: tx.sourceId,
    createdAt: tx.createdAt.toISOString(),
  };
}
