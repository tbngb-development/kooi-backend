import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import {
  TenantPlanNotFoundError,
  CustomPlanSelectionNotAllowedError,
} from "../../../plans/domain/errors/plan.errors";
import {
  PlanAlreadyActiveError,
  NoPendingPlanError,
  OnboardingFeeNotZeroError,
} from "../../domain/errors/payment.errors";
import type { CreateOrderResult } from "../dto/payment.dto";

/**
 * Creates a Razorpay order for plan onboarding payment.
 * Uses EffectivePlanTerms to determine the onboarding fee (respects overrides).
 *
 * For ₹0 onboarding (Enterprise), use ActivateFreeOnboardingUseCase instead.
 */
export class CreateOnboardingOrderUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
  ) {}

  async execute(tenantId: string): Promise<CreateOrderResult> {
    console.log("tenant id: ", tenantId);
    // 1. Get tenant plan (must be PENDING_PAYMENT)
    const tenantPlan = await this.planRepo.getTenantPlan(tenantId);
    if (!tenantPlan) throw new TenantPlanNotFoundError(tenantId);
    if (tenantPlan.status === "ACTIVE") throw new PlanAlreadyActiveError();
    if (tenantPlan.status !== "PENDING_PAYMENT") throw new NoPendingPlanError();

    // 2. Resolve effective terms (PlanVersion + overrides)
    const effectiveTerms = await this.planRepo.getActivePlanForTenant(tenantId);
    if (!effectiveTerms) throw new TenantPlanNotFoundError(tenantId);

    // 3. Block CUSTOM pricing model from self-service Razorpay
    if (effectiveTerms.pricingModel === "CUSTOM") {
      throw new CustomPlanSelectionNotAllowedError();
    }

    // 4. Block ₹0 onboarding from Razorpay flow (use free activation instead)
    if (effectiveTerms.onboardingFee <= 0) {
      throw new OnboardingFeeNotZeroError(effectiveTerms.onboardingFee);
    }

    // 5. Create Razorpay order
    const order = await this.payments.createOrder({
      amountPaisa: effectiveTerms.onboardingFee,
      receipt: `onb_${tenantId.slice(0, 8)}_${Date.now()}`,
      notes: {
        tenantId,
        purpose: "ONBOARDING",
        planVersionId: effectiveTerms.planVersionId,
      },
    });

    // 6. Ensure wallet exists
    const wallet = await this.walletRepo.ensureWallet(tenantId);

    // 7. Create recharge record linked to TenantPlan
    const recharge = await this.rechargeRepo.create({
      walletId: wallet.id,
      tenantId,
      amount: effectiveTerms.onboardingFee,
      purpose: "ONBOARDING",
      status: "INITIATED",
      razorpayOrderId: order.orderId,
      tenantPlanId: tenantPlan.id,
    });

    return {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      rechargeId: recharge.id,
    };
  }
}
