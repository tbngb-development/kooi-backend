import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface CreateUpgradeOrderInput {
  tenantId: string;
  newPlanId: string;
}

export interface CreateUpgradeOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  rechargeId: string;
  newPlanVersionId: string;
  onboardingFeeDifference: number;
}

export class CreateUpgradeOrderUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: CreateUpgradeOrderInput,
  ): Promise<CreateUpgradeOrderResult> {
    // 1. Get current active plan
    const currentPlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!currentPlan || currentPlan.status !== "ACTIVE") {
      throw new TenantPlanNotFoundError(input.tenantId);
    }

    // 2. Get new plan's latest published version
    const newVersion = await this.planRepo.findLatestPublishedVersion(
      input.newPlanId,
    );
    if (!newVersion) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        "No published version for the target plan.",
        "NO_PUBLISHED_VERSION",
      );
    }

    // 3. Prevent same-version no-op
    if (currentPlan.planVersionId === newVersion.id) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Already on this plan version.",
        "SAME_PLAN_VERSION",
      );
    }

    // 4. Calculate fee difference
    const difference = Math.max(
      0,
      newVersion.onboardingFee - currentPlan.onboardingFee,
    );

    if (difference <= 0) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "No additional payment required for this plan change. Use the direct change endpoint.",
        "NO_PAYMENT_REQUIRED",
      );
    }

    // 5. Create Razorpay order
    const order = await this.payments.createOrder({
      amountPaisa: difference,
      receipt: `upg_${input.tenantId.slice(0, 8)}_${Date.now()}`,
      notes: {
        tenantId: input.tenantId,
        purpose: "PLAN_UPGRADE",
        fromPlanVersionId: currentPlan.planVersionId,
        toPlanVersionId: newVersion.id,
      },
    });

    // 6. Ensure wallet exists
    const wallet = await this.walletRepo.ensureWallet(input.tenantId);

    // 7. Create recharge record WITH targetPlanVersionId
    const tenantPlan = await this.planRepo.getTenantPlan(input.tenantId);
    const recharge = await this.rechargeRepo.create({
      walletId: wallet.id,
      tenantId: input.tenantId,
      amount: difference,
      purpose: "ONBOARDING",
      status: "INITIATED",
      razorpayOrderId: order.orderId,
      tenantPlanId: tenantPlan?.id ?? null,
      targetPlanVersionId: newVersion.id, // ← FIX: Was missing! Now routes to processUpgrade()
    });

    this.logger.info("Plan upgrade order created", {
      action: "payment.create_upgrade_order",
      orderId: order.orderId,
      rechargeId: recharge.id,
      tenantId: input.tenantId,
      fromPlanVersionId: currentPlan.planVersionId,
      toPlanVersionId: newVersion.id,
      feeDifferencePaisa: difference,
    });

    return {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      rechargeId: recharge.id,
      newPlanVersionId: newVersion.id,
      onboardingFeeDifference: difference,
    };
  }
}
