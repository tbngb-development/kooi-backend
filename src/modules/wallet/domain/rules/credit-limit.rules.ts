import type { WalletBalances } from "./bonus-first-deduction.rules";
import { getEffectiveAvailableBalance } from "./bonus-first-deduction.rules";

const ESTIMATED_AVG_CALL_SEC = 90;

export interface CreditLimitCheckInput {
  wallet: WalletBalances;
  creditLimitPaisa: number; // planVersion.lowBalanceThreshold
  perMinuteRatePaisa: number; // planVersion.perMinuteRate
  inFlightCallCount: number; // calls with status = CALLING
}

export interface CreditLimitCheckResult {
  shouldStop: boolean;
  availableFundsPaisa: number; // wallet + creditLimit
  projectedInFlightCostPaisa: number;
  remainingBufferPaisa: number; // available - projected
}

/**
 * Determines whether running batches should be stopped based on
 * the tenant's wallet balance, credit limit, and in-flight call cost.
 *
 * Formula:
 *   availableFunds = effectiveBalance + creditLimit
 *   projectedCost  = inFlightCalls × estimatedCostPerCall
 *   STOP when availableFunds - projectedCost <= 0
 */
export function evaluateCreditLimit(
  input: CreditLimitCheckInput,
): CreditLimitCheckResult {
  const effectiveBalance = getEffectiveAvailableBalance(input.wallet);
  const availableFundsPaisa = effectiveBalance + input.creditLimitPaisa;

  const costPerCallPaisa = Math.ceil(
    (input.perMinuteRatePaisa * ESTIMATED_AVG_CALL_SEC) / 60,
  );
  const projectedInFlightCostPaisa = input.inFlightCallCount * costPerCallPaisa;

  const remainingBufferPaisa = availableFundsPaisa - projectedInFlightCostPaisa;

  return {
    shouldStop: remainingBufferPaisa <= 0,
    availableFundsPaisa,
    projectedInFlightCostPaisa,
    remainingBufferPaisa,
  };
}
