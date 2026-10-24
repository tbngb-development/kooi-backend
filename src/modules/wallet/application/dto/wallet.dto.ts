import type { WalletTxType, WalletTxSourceType } from "@prisma/client";

export interface WalletResponse {
  id: string;
  tenantId: string;
  cashBalance: number;
  bonusBalance: number;
  totalBalance: number;
  bonusExpiresAt: string | null;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionResponse {
  id: string;
  walletId: string;
  tenantId: string;
  type: WalletTxType;
  amount: number;
  cashDelta: number;
  bonusDelta: number;
  cashBalanceAfter: number;
  bonusBalanceAfter: number;
  currency: string;
  description: string;
  sourceType: WalletTxSourceType | null;
  sourceId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ListTransactionsQuery {
  page?: number;
  limit?: number;
  type?: WalletTxType;
  sourceType?: WalletTxSourceType;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedTransactionsResponse {
  items: WalletTransactionResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
