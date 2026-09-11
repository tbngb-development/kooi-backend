export interface WalletBalances {
  cashBalance: number;
  bonusBalance: number;
  bonusExpiresAt: Date | null;
}

export interface DeductionSplitResult {
  hasExpiredBonus: boolean;
  expiredBonusAmount: number;
  fromBonus: number;
  fromCash: number;
  newCashBalance: number;
  newBonusBalance: number;
  cashDelta: number;
  bonusDelta: number;
}

/**
 * Computes how a debit should be split between bonusBalance and cashBalance.
 * Rules:
 *  1. If bonus is expired, it is zeroed out and cannot be used.
 *  2. Unexpired bonus balance is consumed first.
 *  3. Remaining amount is deducted from cash balance.
 */
export function computeBonusFirstDeduction(
  wallet: WalletBalances,
  amountPaisa: number,
  now = new Date(),
): DeductionSplitResult {
  if (amountPaisa <= 0) {
    return {
      hasExpiredBonus: false,
      expiredBonusAmount: 0,
      fromBonus: 0,
      fromCash: 0,
      newCashBalance: wallet.cashBalance,
      newBonusBalance: wallet.bonusBalance,
      cashDelta: 0,
      bonusDelta: 0,
    };
  }

  const isBonusExpired = Boolean(
    wallet.bonusExpiresAt &&
    wallet.bonusExpiresAt <= now &&
    wallet.bonusBalance > 0,
  );
  const expiredBonusAmount = isBonusExpired ? wallet.bonusBalance : 0;
  const usableBonus = isBonusExpired ? 0 : wallet.bonusBalance;

  const fromBonus = Math.min(usableBonus, amountPaisa);
  const fromCash = amountPaisa - fromBonus;

  const newCashBalance = wallet.cashBalance - fromCash;
  const newBonusBalance = usableBonus - fromBonus;

  return {
    hasExpiredBonus: isBonusExpired,
    expiredBonusAmount,
    fromBonus,
    fromCash,
    newCashBalance,
    newBonusBalance,
    cashDelta: -fromCash,
    bonusDelta: -fromBonus,
  };
}

/**
 * Checks if a wallet has enough combined usable funds for an operation.
 */
export function hasAvailableBalance(
  wallet: WalletBalances,
  amountPaisa: number,
  now = new Date(),
): boolean {
  if (amountPaisa <= 0) return true;
  const isBonusExpired = Boolean(
    wallet.bonusExpiresAt && wallet.bonusExpiresAt <= now,
  );
  const usableBonus = isBonusExpired ? 0 : wallet.bonusBalance;
  return wallet.cashBalance + usableBonus >= amountPaisa;
}

/**
 * Computes total effective balance (cash + valid bonus).
 */
export function getEffectiveAvailableBalance(
  wallet: WalletBalances,
  now = new Date(),
): number {
  const isBonusExpired = Boolean(
    wallet.bonusExpiresAt && wallet.bonusExpiresAt <= now,
  );
  const usableBonus = isBonusExpired ? 0 : wallet.bonusBalance;
  return wallet.cashBalance + usableBonus;
}
