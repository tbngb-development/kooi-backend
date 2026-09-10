import prisma from "../../../../shared/config/database/prisma";
import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { lowBalanceEmailHtml } from "../../../../shared/config/external/email/templates/low-balance.template";

const DEFAULT_THRESHOLD = 10000; // ₹100 fallback if no active plan

export class CheckLowBalanceUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly email: IEmailService,
  ) {}

  async execute(input: { tenantId: string }): Promise<void> {
    const wallet = await this.walletRepo.findByTenantId(input.tenantId);
    if (!wallet) return;

    // Read threshold from tenant's active plan (plan-based, not wallet-based)
    const activePlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    const threshold =
      activePlan?.status === "ACTIVE"
        ? activePlan.lowBalanceThreshold
        : DEFAULT_THRESHOLD;

    if (wallet.balance >= threshold) return;

    // TODO: Add Redis-based rate limiting (e.g., 24h TTL key per tenant)
    // to prevent duplicate alert emails on every debit.
    // Key pattern: `wallet:low_balance_alert:{tenantId}` EX 86400

    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { email: true, name: true },
    });
    if (!tenant) return;

    await this.email.send({
      to: tenant.email,
      subject: `Low wallet balance — ${tenant.name}`,
      html: lowBalanceEmailHtml({
        tenantName: tenant.name,
        balancePaisa: wallet.balance,
        thresholdPaisa: threshold,
      }),
    });
  }
}
