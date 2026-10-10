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
  allowOverdraft?: boolean;
}

export interface ListTransactionsOptions {
  page: number;
  limit: number;
  type?: WalletTxType;
}

export interface ExpiredBonusWallet {
  id: string;
  tenantId: string;
  bonusBalance: number;
  bonusExpiresAt: Date;
  currency: string;
  tenant: {
    name: string;
    email: string;
  };
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

  /**
   * Finds all wallets with expired, non-zero bonus balances
   * belonging to active tenants with active plans.
   */
  findWalletsWithExpiredBonus(): Promise<ExpiredBonusWallet[]>;

  /**
   * Atomically zeroes the bonus balance and creates a BONUS_EXPIRY
   * ledger entry. Returns null if the bonus was already expired
   * (idempotent). Uses FOR UPDATE row lock for concurrency safety.
   */
  expireBonus(tenantId: string): Promise<WalletTransaction | null>;

  findTransactionByIdempotencyKey(
  walletId: string,
  idempotencyKey: string,
): Promise<WalletTransaction | null>;
}
