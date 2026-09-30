import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { bonusExpiredEmailHtml } from "../../../../shared/config/external/email/templates/bonus-expired.template";

export interface BonusExpiryResult {
  processed: number;
  skipped: number;
  failed: number;
}

/**
 * Proactively expires bonus credits for all eligible wallets.
 *
 * For each wallet with expired, non-zero bonus:
 *  1. Atomically zeroes bonusBalance and creates BONUS_EXPIRY ledger entry
 *  2. Records BONUS_EXPIRED TenantPlanEvent for audit
 *  3. Sends notification email to tenant
 *
 * Each wallet is processed independently — one failure does not block others.
 */
export class ExpireBonusCreditsUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly email: IEmailService,
  ) {}

  async execute(): Promise<BonusExpiryResult> {
    const expiredWallets = await this.walletRepo.findWalletsWithExpiredBonus();

    if (expiredWallets.length === 0) {
      return { processed: 0, skipped: 0, failed: 0 };
    }

    console.log(
      `[BonusExpiry] Found ${expiredWallets.length} wallet(s) with expired bonus`,
    );

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const wallet of expiredWallets) {
      try {
        // 1. Atomic bonus expiry (idempotent, row-locked)
        const tx = await this.walletRepo.expireBonus(wallet.tenantId);

        if (!tx) {
          skipped++;
          continue;
        }

        // 2. Record TenantPlanEvent (best-effort, non-blocking)
        try {
          await this.planRepo.recordBonusExpiredEvent(wallet.tenantId);
        } catch (err) {
          console.error(
            `[BonusExpiry] Failed to record plan event for tenant ${wallet.tenantId}:`,
            err,
          );
          // Do not increment failed — the financial operation succeeded
        }

        // 3. Send notification email (best-effort, non-blocking)
        try {
          const html = bonusExpiredEmailHtml({
            tenantName: wallet.tenant.name,
            expiredAmountPaisa: tx.amount,
            currency: wallet.currency,
          });

          await this.email.send({
            to: wallet.tenant.email,
            subject: `Kooi — ₹${(tx.amount / 100).toFixed(2)} bonus credits expired`,
            html,
          });
        } catch (err) {
          console.error(
            `[BonusExpiry] Failed to send email for tenant ${wallet.tenantId}:`,
            err,
          );
        }

        processed++;
      } catch (err) {
        console.error(
          `[BonusExpiry] Failed to expire bonus for tenant ${wallet.tenantId}:`,
          err,
        );
        failed++;
      }
    }

    console.log(
      `[BonusExpiry] Complete — processed: ${processed}, skipped: ${skipped}, failed: ${failed}`,
    );

    return { processed, skipped, failed };
  }
}
