// src/modules/wallet/application/use-cases/check-low-balance.use-case.ts
import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { lowBalanceEmailHtml } from "../../../../shared/config/external/email/templates/low-balance.template";
import { getEffectiveAvailableBalance } from "../../domain/rules/bonus-first-deduction.rules";
import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type {
  IDiscordEventsPublisher,
  DiscordEvent,
} from "../../../../shared/config/external/notifications/discordevents-publisher";
import { noopDiscordEventsPublisher } from "../../../../shared/config/external/notifications/discordevents-publisher";

export class CheckLowBalanceUseCase {
  /**
   * Process-local crossing state: notify once per tenant while the balance
   * remains below the active plan threshold, and re-arm once it recovers.
   * No delivery state is persisted.
   */
  private readonly lowBalanceNotifiedTenants = new Set<string>();

  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly email: IEmailService,
    private readonly logger: Logger,
    private readonly notifications: IDiscordEventsPublisher = noopDiscordEventsPublisher,
  ) {}

  async execute(input: { tenantId: string }): Promise<void> {
    const plan = await this.planRepo.getActivePlanForTenant(input.tenantId);
    if (!plan || plan.status !== "ACTIVE") return;

    const wallet = await this.walletRepo.findByTenantId(input.tenantId);
    if (!wallet) return;

    const availableBalance = getEffectiveAvailableBalance(wallet);
    const isLow =
      availableBalance <= plan.warningThreshold;

    if (!isLow) {
      this.lowBalanceNotifiedTenants.delete(input.tenantId);
      return;
    }

    const shouldNotify =
      !this.lowBalanceNotifiedTenants.has(input.tenantId);
    if (shouldNotify) {
      this.lowBalanceNotifiedTenants.add(input.tenantId);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { email: true, name: true },
    });

    if (tenant?.email) {
      await this.email.send({
        to: tenant.email,
        subject: "KOOI — Low Wallet Balance Alert",
        html: lowBalanceEmailHtml({
          tenantName: tenant.name,
          balancePaisa: availableBalance,
          thresholdPaisa: plan.warningThreshold,
        }),
      });

      this.logger.warn("Low balance threshold triggered", {
        action: "wallet.low_balance",
        tenantId: input.tenantId,
        balancePaisa: availableBalance,
        thresholdPaisa: plan.warningThreshold,
      });
    }

    if (shouldNotify) {
      await this.publishLowBalance({
        tenantId: input.tenantId,
        tenantName: tenant?.name || input.tenantId,
        balancePaisa: availableBalance,
        thresholdPaisa: plan.warningThreshold,
      });
    }
  }

  private async publishLowBalance(input: {
    tenantId: string;
    tenantName: string;
    balancePaisa: number;
    thresholdPaisa: number;
  }): Promise<void> {
    try {
      const event: DiscordEvent = {
        eventId: `wallet.low_balance:${input.tenantId}:crossed`,
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
