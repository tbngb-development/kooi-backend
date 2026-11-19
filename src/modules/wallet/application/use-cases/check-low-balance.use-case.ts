// src/modules/wallet/application/use-cases/check-low-balance.use-case.ts
import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletIncidentStateRepository } from "../interfaces/wallet-incident-state-repository.interface";
import type { IEmailOutboxRepository } from "../../../../shared/config/external/email/outbox-repository.types";
import { lowBalanceEmailHtml } from "../../../../shared/config/external/email/templates/low-balance.template";
import { getEffectiveAvailableBalance } from "../../domain/rules/bonus-first-deduction.rules";
import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  IDiscordEventsPublisher,
  DiscordEvent,
} from "../../../../shared/config/external/notifications/discordevents-publisher";
import { noopDiscordEventsPublisher } from "../../../../shared/config/external/notifications/discordevents-publisher";

/**
 * Positive-balance low-balance warning.
 *
 * Fires only while 0 < availableBalance <= warningThreshold. At balance <= 0
 * the credit enforcement path owns notification and stopping; this use case
 * never stops campaigns or batches and never changes enforcement state.
 *
 * Dedup is durable via WalletIncidentState.warningSentAt: one warning per
 * low-balance crossing, re-armed only by clearWarning once balance recovers
 * above the threshold. All idempotency keys are derived from the claimed
 * crossing timestamp so concurrent debits, duplicate webhooks and retries
 * converge on a single email and a single Discord event.
 */
export class CheckLowBalanceUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly incidents: WalletIncidentStateRepository,
    private readonly emailOutbox: IEmailOutboxRepository,
    private readonly logger: Logger,
    private readonly notifications: IDiscordEventsPublisher = noopDiscordEventsPublisher,
  ) {}

  async execute(input: { tenantId: string }): Promise<void> {
    const plan = await this.planRepo.getActivePlanForTenant(input.tenantId);
    if (!plan || plan.status !== "ACTIVE") return;

    const wallet = await this.walletRepo.findByTenantId(input.tenantId);
    if (!wallet) return;

    const availableBalance = getEffectiveAvailableBalance(wallet);
    const threshold = plan.warningThreshold;

    // Zero/negative is an enforcement concern, never a warning.
    if (availableBalance <= 0) return;

    if (availableBalance > threshold) {
      await this.clearWarningSafely(input.tenantId);
      return;
    }

    // 0 < availableBalance <= threshold: claim this crossing atomically.
    const crossingAt = await this.incidents.claimWarning({
      tenantId: input.tenantId,
      balancePaisa: availableBalance,
    });

    const thresholdVersion = `${plan.planVersionId}:${plan.version}:${threshold}`;
    const warningKey =
      `warn:${input.tenantId}:${thresholdVersion}:${crossingAt.toISOString()}`;

    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { email: true, name: true },
    });

    // Email is best-effort and durable: a failure is logged, never thrown, and
    // the key makes a duplicate enqueue replay-safe.
    if (tenant?.email) {
      try {
        await this.emailOutbox.enqueue({
          idempotencyKey: warningKey,
          to: tenant.email,
          subject: "KOOI — Low Wallet Balance Alert",
          html: lowBalanceEmailHtml({
            tenantName: tenant.name,
            balancePaisa: availableBalance,
            thresholdPaisa: threshold,
          }),
        });
      } catch (err) {
        this.logger.error("Low balance email enqueue failed", err, {
          action: "wallet.low_balance.email_enqueue_failed",
          tenantId: input.tenantId,
        });
      }
    }

    this.logger.warn("Low balance threshold triggered", {
      action: "wallet.low_balance",
      tenantId: input.tenantId,
      balancePaisa: availableBalance,
      thresholdPaisa: threshold,
    });

    await this.publishLowBalance({
      eventId: warningKey,
      tenantId: input.tenantId,
      tenantName: tenant?.name || input.tenantId,
      balancePaisa: availableBalance,
      thresholdPaisa: threshold,
    });
  }

  private async clearWarningSafely(tenantId: string): Promise<void> {
    try {
      await this.incidents.clearWarning(tenantId);
    } catch (err) {
      this.logger.error("Low balance warning state clear failed", err, {
        action: "wallet.low_balance.clear_failed",
        tenantId,
      });
    }
  }

  private async publishLowBalance(input: {
    eventId: string;
    tenantId: string;
    tenantName: string;
    balancePaisa: number;
    thresholdPaisa: number;
  }): Promise<void> {
    try {
      const event: DiscordEvent = {
        eventId: input.eventId,
        eventType: "wallet.low_balance",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        tenantId: input.tenantId,
        source: "kooi-backend",
        data: {
          tenantName: input.tenantName,
          tenantId: input.tenantId,
          balancePaisa: input.balancePaisa,
          thresholdPaisa: input.thresholdPaisa,
          dashboardPath: "/billing",
        },
      };

      await this.notifications.publish(event);
    } catch (error) {
      this.logger.error("failed to publish wallet.low_balance event", error, {
        action: "notification.publish_failed",
        tenantId: input.tenantId,
      });
    }
  }
}
