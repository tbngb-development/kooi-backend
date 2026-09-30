import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { bonusExpiredEmailHtml } from "../../../../shared/config/external/email/templates/bonus-expired.template";
import type { Logger } from "../../../../shared/logging/logger.interface";

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
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<BonusExpiryResult> {
    const expiredWallets = await this.walletRepo.findWalletsWithExpiredBonus();

    if (expiredWallets.length === 0) {
      return { processed: 0, skipped: 0, failed: 0 };
    }

    this.logger.info("Bonus expiry sweep started", {
      action: "wallet.bonus_expiry.sweep_start",
      walletCount: expiredWallets.length,
    });

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
          this.logger.error("Failed to record bonus expired plan event", err, {
            action: "wallet.bonus_expiry.plan_event_failed",
            tenantId: wallet.tenantId,
          });
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
          this.logger.error("Failed to send bonus expiry email", err, {
            action: "wallet.bonus_expiry.email_failed",
            tenantId: wallet.tenantId,
          });
        }

        processed++;
      } catch (err) {
        this.logger.error("Failed to expire bonus for tenant", err, {
          action: "wallet.bonus_expiry.tenant_failed",
          tenantId: wallet.tenantId,
        });
        failed++;
      }
    }

    this.logger.info("Bonus expiry sweep completed", {
      action: "wallet.bonus_expiry.sweep_complete",
      processed,
      skipped,
      failed,
    });

    return { processed, skipped, failed };
  }
}
