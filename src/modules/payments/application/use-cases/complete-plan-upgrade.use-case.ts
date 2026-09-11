import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";

export interface CompletePlanUpgradeInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  newPlanVersionId: string;
}

export interface CompletePlanUpgradeResult {
  tenantId: string;
  newPlanVersionId: string;
  amountPaid: number;
}

/**
 * Completes a plan upgrade after the tenant pays the onboarding fee difference.
 *
 * Flow:
 *  1. Verify recharge exists and is not already processed
 *  2. Mark recharge SUCCESS
 *  3. Activate the new plan version (TenantPlanEvent recorded by repo)
 *  4. Wallet balance carries over unchanged
 */
export class CompletePlanUpgradePaymentUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
  ) {}

  async execute(
    input: CompletePlanUpgradeInput,
  ): Promise<CompletePlanUpgradeResult> {
    // 1. Find and validate recharge
    const recharge = await this.rechargeRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );
    if (!recharge) throw new RechargeNotFoundError(input.razorpayOrderId);

    if (recharge.status === "SUCCESS") {
      return {
        tenantId: recharge.tenantId,
        newPlanVersionId: input.newPlanVersionId,
        amountPaid: recharge.amount,
      };
    }

    // 2. Mark recharge SUCCESS
    await this.rechargeRepo.markSuccess(
      recharge.id,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );

    // 3. Get current plan to preserve bonus expiry
    const currentPlan = await this.planRepo.getActivePlanForTenant(
      recharge.tenantId,
    );
    if (!currentPlan) throw new TenantPlanNotFoundError(recharge.tenantId);

    // 4. Activate new plan version
    await this.planRepo.activatePlan(
      recharge.tenantId,
      input.newPlanVersionId,
      currentPlan.bonusExpiresAt,
      "plan-upgrade-payment",
    );

    return {
      tenantId: recharge.tenantId,
      newPlanVersionId: input.newPlanVersionId,
      amountPaid: recharge.amount,
    };
  }
}
