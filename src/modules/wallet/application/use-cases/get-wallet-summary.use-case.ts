import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { WalletTransactionSummaryResponse } from "../dto/wallet.dto";

export class GetWalletSummaryUseCase {
  constructor(private readonly walletRepo: WalletRepository) {}

  async execute(tenantId: string): Promise<WalletTransactionSummaryResponse> {
    const summary = await this.walletRepo.getTransactionSummary(tenantId);
    return summary;
  }
}

