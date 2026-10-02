import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { WalletResponse } from "../dto/wallet.dto";
import { toWalletResponse } from "../mappers/wallet.mapper";

export class GetWalletUseCase {
  constructor(private readonly walletRepo: WalletRepository) {}

  async execute(tenantId: string): Promise<WalletResponse> {
    const wallet = await this.walletRepo.ensureWallet(tenantId);
    return toWalletResponse(wallet);
  }
}