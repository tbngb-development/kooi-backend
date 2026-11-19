import type { WalletBalances } from "./bonus-first-deduction.rules";
import { getEffectiveAvailableBalance } from "./bonus-first-deduction.rules";

/**
 * The single definition of "may this tenant start new call execution?".
 *
 * U-02: only real, currently-usable funds (cash + unexpired bonus) count here.
 * `credit_limit` is a purchasing-power estimate for sizing and warnings; it
 * must never satisfy this gate. Settlement of already-dispatched calls is a
 * separate path and is intentionally allowed to run into negative balance.
 */
export function hasExecutableBalance(
  wallet: WalletBalances,
  now = new Date(),
): boolean {
  return getEffectiveAvailableBalance(wallet, now) > 0;
}
