// modules/wallet/application/guards/call-wallet.guard.ts

import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import { hasExecutableBalance } from "../../domain/rules/wallet-balance.policy";
import {
  WalletNotFoundError,
  InsufficientBalanceError,
} from "../../domain/errors/wallet.errors";

export interface ICallWalletGuard {
  hasSufficientBalance(tenantId: string, now?: Date): Promise<boolean>;
  assertSufficientBalance(tenantId: string, now?: Date): Promise<void>;
}

export class CallWalletGuard implements ICallWalletGuard {
  constructor(private readonly walletRepo: WalletRepository) {}

  /**
   * Non-throwing check. Returns true if the tenant has a valid wallet
   * with a strictly positive usable balance (cash + valid bonus).
   */
  async hasSufficientBalance(tenantId: string, now = new Date()): Promise<boolean> {
    const wallet = await this.walletRepo.findByTenantId(tenantId);
    if (!wallet) {
      return false;
    }

    return hasExecutableBalance(wallet, now);
  }

  /**
   * Throwing check. Asserts the tenant has sufficient funds before initiating a call.
   * Throws WalletNotFoundError if wallet does not exist.
   * Throws InsufficientBalanceError if usable balance <= 0.
   */
  async assertSufficientBalance(tenantId: string, now = new Date()): Promise<void> {
    const wallet = await this.walletRepo.findByTenantId(tenantId);
    if (!wallet) {
      throw new WalletNotFoundError(tenantId);
    }

    if (!hasExecutableBalance(wallet, now)) {
      throw new InsufficientBalanceError(
        "Insufficient wallet balance to place a call. Please recharge your wallet.",
      );
    }
  }
}
