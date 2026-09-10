import type { Wallet, WalletTransaction } from "@prisma/client";

export interface CreateWalletData {
  tenantId: string;
  balance?: number;
  bonusBalance?: number;
  bonusExpiresAt?: Date | null;
}

export interface CreditWalletData {
  tenantId: string;
  amount: number;
  type: "CREDIT" | "BONUS" | "REFUND" | "ADJUSTMENT";
  description: string;
  referenceType?: string;
  referenceId?: string;
  createdBy?: string | null;
  bonusExpiresAt?: Date | null;
}

export interface DebitWalletData {
  tenantId: string;
  amount: number;
  description: string;
  referenceType: string;
  referenceId: string;
  createdBy?: string | null;
}

export interface WalletRepository {
  findByTenantId(tenantId: string): Promise<Wallet | null>;
  create(data: CreateWalletData): Promise<Wallet>;
  ensureWallet(tenantId: string): Promise<Wallet>;

  credit(data: CreditWalletData): Promise<WalletTransaction>;
  debit(data: DebitWalletData): Promise<WalletTransaction>;

  listTransactions(
    tenantId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: WalletTransaction[]; total: number }>;
}
