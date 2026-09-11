import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { AdjustWalletInput } from "../dto/admin-wallet.dto";
import type { WalletTransactionResponse } from "../dto/wallet.dto";
import { toWalletTransactionResponse } from "../mappers/wallet.mapper";

export class AdjustWalletUseCase {
  constructor(private readonly walletRepo: WalletRepository) {}

  async execute(
    input: AdjustWalletInput,
    adminUserId: string,
  ): Promise<WalletTransactionResponse> {
    await this.walletRepo.ensureWallet(input.tenantId);

    const bonusExpiresAt = input.bonusExpiresAt
      ? new Date(input.bonusExpiresAt)
      : null;

    if (input.type === "DEBIT") {
      const tx = await this.walletRepo.debit({
        tenantId: input.tenantId,
        amount: input.amount,
        description: input.description,
        sourceType: "ADMIN_ADJUSTMENT",
        sourceId: `admin_${Date.now()}`,
        idempotencyKey: `admin_adj_${input.tenantId}_${Date.now()}`,
        createdBy: adminUserId,
      });
      return toWalletTransactionResponse(tx);
    }

    const tx = await this.walletRepo.credit({
      tenantId: input.tenantId,
      amount: input.amount,
      type: input.type,
      targetBalance: input.targetBalance,
      description: input.description,
      sourceType: "ADMIN_ADJUSTMENT",
      sourceId: `admin_${Date.now()}`,
      idempotencyKey: `admin_adj_${input.tenantId}_${Date.now()}`,
      createdBy: adminUserId,
      bonusExpiresAt,
    });

    return toWalletTransactionResponse(tx);
  }
}
