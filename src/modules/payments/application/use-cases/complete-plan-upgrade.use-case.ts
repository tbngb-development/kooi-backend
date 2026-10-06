import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import {
  InvalidPaymentStateError,
  RechargeNotFoundError,
} from "../../domain/errors/payment.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

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

export class CompletePlanUpgradePaymentUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly planRepo: PlanRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: CompletePlanUpgradeInput,
  ): Promise<CompletePlanUpgradeResult> {
    // 1. Find and validate recharge
    const recharge = await this.rechargeRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );
    if (!recharge) throw new RechargeNotFoundError(input.razorpayOrderId);

    // 2. Validate target plan version alignment
    const targetVersionId =
      recharge.targetPlanVersionId ?? input.newPlanVersionId;
    if (
      recharge.targetPlanVersionId &&
      recharge.targetPlanVersionId !== input.newPlanVersionId
    ) {
      this.logger.error("Plan upgrade version mismatch", undefined, {
        action: "payment.complete_plan_upgrade.mismatch",
        rechargeTarget: recharge.targetPlanVersionId,
        inputTarget: input.newPlanVersionId,
      });
      throw new InvalidPaymentStateError(
        "Payment order was initialized for a different plan version.",
      );
    }

    if (recharge.status === "SUCCESS") {
      this.logger.info("Plan upgrade payment already processed (idempotent)", {
        action: "payment.complete_plan_upgrade",
        orderId: input.razorpayOrderId,
        tenantId: recharge.tenantId,
        newPlanVersionId: targetVersionId,
      });
      return {
        tenantId: recharge.tenantId,
        newPlanVersionId: targetVersionId,
        amountPaid: recharge.amount,
      };
    }

    // 3. Mark recharge SUCCESS
    await this.rechargeRepo.markSuccess(
      recharge.id,
      input.razorpayPaymentId,
      input.razorpaySignature,
    );

    // 4. Fetch current terms to preserve bonus expiry
    const currentPlan = await this.planRepo.getActivePlanForTenant(
      recharge.tenantId,
    );
    if (!currentPlan) throw new TenantPlanNotFoundError(recharge.tenantId);

    // 5. Activate target PlanVersion
    await this.planRepo.activatePlan(
      recharge.tenantId,
      targetVersionId,
      currentPlan.bonusExpiresAt,
      "plan-upgrade-payment",
    );

    this.logger.info("Plan upgrade payment completed", {
      action: "payment.complete_plan_upgrade",
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      rechargeId: recharge.id,
      tenantId: recharge.tenantId,
      newPlanVersionId: targetVersionId,
      amountPaidPaisa: recharge.amount,
    });

    return {
      tenantId: recharge.tenantId,
      newPlanVersionId: targetVersionId,
      amountPaid: recharge.amount,
    };
  }
}
