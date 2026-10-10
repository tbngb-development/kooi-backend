import type { WalletRepository } from "../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import { calculateCallCost } from "../../../plans/domain/rules/billing-calculator";
import { InsufficientBalanceError } from "../../domain/errors/wallet.errors";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import { getEffectiveAvailableBalance } from "../../domain/rules/bonus-first-deduction.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

const ESTIMATED_AVG_CALL_SEC = 90;

export interface CheckBalanceForBatchResult {
  ok: boolean;
  warning: boolean;
  balance: number;
  estimatedCost: number;
}

export class CheckBalanceForBatchUseCase {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly planRepo: PlanRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: {
    tenantId: string;
    leadCount: number;
  }): Promise<CheckBalanceForBatchResult> {
    const plan = await this.planRepo.getActivePlanForTenant(input.tenantId);
    if (!plan || plan.status !== "ACTIVE") {
      throw new TenantPlanNotFoundError(input.tenantId);
    }

    const wallet = await this.walletRepo.ensureWallet(input.tenantId);
    const availableBalance = getEffectiveAvailableBalance(wallet);

    const perCall = calculateCallCost({
      durationSec: ESTIMATED_AVG_CALL_SEC,
      perMinuteRate: plan.perMinuteRate,
      billingMinimumSec: plan.billingMinimumSec,
      billingIncrementSec: plan.billingIncrementSec,
    });

    const estimatedCost = perCall.costPaisa * Math.max(input.leadCount, 0);

    const creditLimitPaisa = plan.lowBalanceThreshold ?? 0;
    const effectivePurchasingPower = availableBalance + creditLimitPaisa;

    if (effectivePurchasingPower <= 0) {
      this.logger.warn("Wallet credit limit reached for batch", {
        action: "wallet.check_balance_batch",
        tenantId: input.tenantId,
        leadCount: input.leadCount,
        balancePaisa: availableBalance,
        creditLimitPaisa,
      });
      throw new InsufficientBalanceError(
        `Wallet credit limit exceeded (balance: ₹${(availableBalance / 100).toFixed(2)}, credit limit: ₹${(creditLimitPaisa / 100).toFixed(2)}). Please recharge before launching or resuming batches.`,
      );
    }

    const minRequiredPaisa = Math.floor(estimatedCost * 0.5);

    // Require at least 50% buffer to schedule the batch
    if (input.leadCount > 0 && effectivePurchasingPower < minRequiredPaisa) {
      this.logger.warn("Insufficient balance for batch", {
        action: "wallet.check_balance_batch",
        tenantId: input.tenantId,
        leadCount: input.leadCount,
        balancePaisa: availableBalance,
        effectivePurchasingPower,
        estimatedCostPaisa: estimatedCost,
        requiredMinimumPaisa: minRequiredPaisa,
      });
      throw new InsufficientBalanceError(
        `Insufficient balance. You need at least ₹${(minRequiredPaisa / 100).toFixed(2)} in available balance/credit to launch ${input.leadCount} leads.`,
      );
    }

    const warning = effectivePurchasingPower < estimatedCost;
    if (warning) {
      this.logger.warn("Low balance warning for batch", {
        action: "wallet.check_balance_batch",
        tenantId: input.tenantId,
        leadCount: input.leadCount,
        balancePaisa: availableBalance,
        effectivePurchasingPower,
        estimatedCostPaisa: estimatedCost,
      });
    }

    return {
      ok: true,
      warning,
      balance: availableBalance,
      estimatedCost,
    };
  }
}
