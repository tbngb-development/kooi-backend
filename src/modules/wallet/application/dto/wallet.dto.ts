export interface WalletResponse {
  id: string;
  tenantId: string;
  balance: number;
  bonusBalance: number;
  bonusExpiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionResponse {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  bonusBalanceAfter: number;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface ListTransactionsResult {
  items: WalletTransactionResponse[];
  total: number;
  page: number;
  limit: number;
}
