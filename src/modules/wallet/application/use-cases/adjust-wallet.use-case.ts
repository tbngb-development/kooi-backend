import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { AdjustWalletInput } from "../dto/admin-wallet.dto";
import type { WalletTransactionResponse } from "../dto/wallet.dto";
import { toWalletTransactionResponse } from "../mappers/wallet.mapper";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class AdjustWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: AdjustWalletInput,
    adminUserId: string,
  ): Promise<WalletTransactionResponse> {
    await this.walletRepo.ensureWallet(input.tenantId);

    const bonusExpiresAt =
      input.bonusExpiresAt !== undefined
        ? input.bonusExpiresAt
          ? new Date(input.bonusExpiresAt)
          : null
        : undefined;

    const idempotencyKey =
      input.idempotencyKey ||
      `admin_adj_${input.tenantId}_${input.type}_${input.amount}_${Math.floor(Date.now() / 60000)}`;

    if (input.type === "DEBIT") {
      const tx = await this.walletRepo.debit({
        tenantId: input.tenantId,
        amount: input.amount,
        description: input.description,
        sourceType: "ADMIN_ADJUSTMENT",
        sourceId: `admin_${adminUserId}`,
        idempotencyKey,
        createdBy: adminUserId,
        allowOverdraft: false,
      });

      this.logger.info("Admin wallet adjustment (debit)", {
        action: "wallet.admin_adjust",
        tenantId: input.tenantId,
        adminUserId,
        amountPaisa: input.amount,
        type: "DEBIT",
        transactionId: tx.id,
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
      sourceId: `admin_${adminUserId}`,
      idempotencyKey,
      createdBy: adminUserId,
      bonusExpiresAt,
    });

    this.logger.info("Admin wallet adjustment (credit)", {
      action: "wallet.admin_adjust",
      tenantId: input.tenantId,
      adminUserId,
      amountPaisa: input.amount,
      type: input.type,
      targetBalance: input.targetBalance,
      transactionId: tx.id,
    });

    return toWalletTransactionResponse(tx);
  }
}
