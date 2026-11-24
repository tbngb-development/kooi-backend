import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { WalletTransactionDetailResponse } from "../dto/wallet.dto";
import { toWalletTransactionDetailResponse } from "../mappers/wallet.mapper";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class GetTransactionDetailUseCase {
  constructor(private readonly walletRepo: WalletRepository) {}

  async execute(
    id: string,
    tenantId: string,
  ): Promise<WalletTransactionDetailResponse> {
    const tx = await this.walletRepo.findTransactionByIdAndTenant(id, tenantId);
    if (!tx) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        `Wallet transaction with ID '${id}' not found`,
        "TRANSACTION_NOT_FOUND",
      );
    }

    return toWalletTransactionDetailResponse(tx);
  }
}

