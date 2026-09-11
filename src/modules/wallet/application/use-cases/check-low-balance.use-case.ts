// src/modules/wallet/application/use-cases/check-low-balance.use-case.ts
import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../../shared/config/external/email/email.interface";
import { lowBalanceEmailHtml } from "../../../../shared/config/external/email/templates/low-balance.template";
import { getEffectiveAvailableBalance } from "../../domain/rules/bonus-first-deduction.rules";
import prisma from "../../../../shared/config/database/prisma";

export class CheckLowBalanceUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly email: IEmailService,
  ) {}

  async execute(input: { tenantId: string }): Promise<void> {
    const plan = await this.planRepo.getActivePlanForTenant(input.tenantId);
    if (!plan || plan.status !== "ACTIVE") return;

    const wallet = await this.walletRepo.findByTenantId(input.tenantId);
    if (!wallet) return;

    const availableBalance = getEffectiveAvailableBalance(wallet);

    if (availableBalance <= plan.lowBalanceThreshold) {
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
            balancePaisa: availableBalance, // Corrected parameter name
            thresholdPaisa: plan.lowBalanceThreshold,
          }),
        });
      }
    }
  }
}
