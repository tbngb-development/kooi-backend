import type { Wallet, WalletTransaction } from "@prisma/client";
import type {
  WalletResponse,
  WalletTransactionResponse,
} from "../dto/wallet.dto";

export function toWalletResponse(wallet: Wallet): WalletResponse {
  return {
    id: wallet.id,
    tenantId: wallet.tenantId,
    balance: wallet.balance,
    bonusBalance: wallet.bonusBalance,
    bonusExpiresAt: wallet.bonusExpiresAt?.toISOString() ?? null,
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
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    bonusBalanceAfter: tx.bonusBalanceAfter,
    description: tx.description,
    referenceType: tx.referenceType,
    referenceId: tx.referenceId,
    createdAt: tx.createdAt.toISOString(),
  };
}
