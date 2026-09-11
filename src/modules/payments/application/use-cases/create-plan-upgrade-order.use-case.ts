import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import {
  TenantPlanNotFoundError,
  PlanNotActiveError,
  CustomPlanSelectionNotAllowedError,
  NoPublishedPlanVersionError,
} from "../../../plans/domain/errors/plan.errors";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";
import type { CreateOrderResult } from "../dto/payment.dto";

export interface CreatePlanUpgradeOrderInput {
  tenantId: string;
  newPlanId: string;
}

/**
 * Creates a Razorpay order for the onboarding fee DIFFERENCE during a plan upgrade.
 *
 * Preconditions:
 *  - Tenant must have an ACTIVE plan
 *  - Target plan must have a PUBLISHED version
 *  - Target plan must not be CUSTOM/Enterprise
 *  - Fee difference must be > 0 (otherwise no payment needed)
 *
 * The target plan version ID is stored on the Recharge record so that
 * CompletePaymentUseCase can automatically activate it after payment.
 *
 * Flow:
 *  1. Validate current plan is ACTIVE
 *  2. Resolve new plan's latest published version
 *  3. Calculate fee difference (new - current)
 *  4. Create Razorpay order for the difference
 *  5. Create Recharge with targetPlanVersionId
 */
export class CreatePlanUpgradeOrderUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
  ) {}

  async execute(
    input: CreatePlanUpgradeOrderInput,
  ): Promise<
    CreateOrderResult & { newPlanVersionId: string; feeDifference: number }
  > {
    // 1. Validate current plan
    const currentTerms = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!currentTerms) throw new TenantPlanNotFoundError(input.tenantId);
    if (currentTerms.status !== "ACTIVE") throw new PlanNotActiveError();

    // 2. Resolve new plan's latest published version
    const newPlan = await this.planRepo.findById(input.newPlanId);
    if (!newPlan || !newPlan.isActive) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        `Plan ${input.newPlanId} not found or inactive.`,
        "PLAN_NOT_FOUND",
      );
    }

    const newVersion = await this.planRepo.findLatestPublishedVersion(
      input.newPlanId,
    );
    if (!newVersion) throw new NoPublishedPlanVersionError(newPlan.name);

    // 3. Block Enterprise self-upgrade
    if (newVersion.pricingModel === "CUSTOM") {
      throw new CustomPlanSelectionNotAllowedError();
    }

    // 4. Prevent same-version no-op
    if (currentTerms.planVersionId === newVersion.id) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Already on this plan version.",
        "SAME_PLAN_VERSION",
      );
    }

    // 5. Calculate fee difference
    const feeDifference = Math.max(
      0,
      newVersion.onboardingFee - currentTerms.onboardingFee,
    );

    if (feeDifference <= 0) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "No additional payment required for this change. Use POST /v1/plans/change directly.",
        "NO_PAYMENT_REQUIRED",
      );
    }

    // 6. Create Razorpay order
    const order = await this.payments.createOrder({
      amountPaisa: feeDifference,
      receipt: `upg_${input.tenantId.slice(0, 8)}_${Date.now()}`,
      notes: {
        tenantId: input.tenantId,
        purpose: "PLAN_UPGRADE",
        fromPlanVersionId: currentTerms.planVersionId,
        toPlanVersionId: newVersion.id,
      },
    });

    // 7. Ensure wallet exists
    const wallet = await this.walletRepo.ensureWallet(input.tenantId);

    // 8. Get TenantPlan ID for linkage
    const tenantPlan = await this.planRepo.getTenantPlan(input.tenantId);

    // 9. Create recharge with target plan version for auto-activation
    const recharge = await this.rechargeRepo.create({
      walletId: wallet.id,
      tenantId: input.tenantId,
      amount: feeDifference,
      purpose: "ONBOARDING",
      status: "INITIATED",
      razorpayOrderId: order.orderId,
      tenantPlanId: tenantPlan?.id ?? null,
      targetPlanVersionId: newVersion.id, // ← KEY: stored for auto-activation
    });

    return {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      rechargeId: recharge.id,
      newPlanVersionId: newVersion.id,
      feeDifference,
    };
  }
}
