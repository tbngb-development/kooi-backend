import type {
  Wallet,
  WalletTransaction,
  WalletTxType,
  WalletTxSourceType,
} from "@prisma/client";

export interface CreateWalletData {
  tenantId: string;
  cashBalance?: number;
  bonusBalance?: number;
  bonusExpiresAt?: Date | null;
  currency?: string;
}

export interface CreditWalletData {
  tenantId: string;
  amount: number; // positive integer in paisa
  type: "CREDIT" | "BONUS" | "REFUND" | "ADJUSTMENT";
  targetBalance?: "CASH" | "BONUS";
  description: string;
  sourceType?: WalletTxSourceType;
  sourceId?: string;
  idempotencyKey?: string;
  createdBy?: string | null;
  bonusExpiresAt?: Date | null;
}

export interface DebitWalletData {
  tenantId: string;
  amount: number; // positive integer in paisa
  description: string;
  sourceType: WalletTxSourceType;
  sourceId: string;
  idempotencyKey: string;
  createdBy?: string | null;
}

export interface ListTransactionsOptions {
  page: number;
  limit: number;
  type?: WalletTxType;
}

export interface WalletRepository {
  findByTenantId(tenantId: string): Promise<Wallet | null>;
  ensureWallet(tenantId: string): Promise<Wallet>;
  create(data: CreateWalletData): Promise<Wallet>;

  credit(data: CreditWalletData): Promise<WalletTransaction>;
  debit(data: DebitWalletData): Promise<WalletTransaction>;

  listTransactions(
    tenantId: string,
    opts: ListTransactionsOptions,
  ): Promise<{ items: WalletTransaction[]; total: number }>;
}
