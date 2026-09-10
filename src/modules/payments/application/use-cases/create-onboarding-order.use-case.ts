import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import { TenantPlanNotFoundError } from "../../../plans/domain/errors/plan.errors";
import { CustomPlanSelectionNotAllowedError } from "../../../plans/domain/errors/plan.errors";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";

export class CreateOnboardingOrderUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
  ) {}

  async execute(tenantId: string) {
    const active = await this.planRepo.getActivePlanForTenant(tenantId);
    if (!active) throw new TenantPlanNotFoundError(tenantId);
    if (active.status === "ACTIVE") {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Plan already active",
        "PLAN_ALREADY_ACTIVE",
      );
    }

    // Defense-in-depth: block Razorpay order for custom/enterprise plans
    if (active.pricingModel === "CUSTOM") {
      throw new CustomPlanSelectionNotAllowedError();
    }

    const order = await this.payments.createOrder({
      amountPaisa: active.onboardingFee,
      receipt: `onb_${tenantId.slice(0, 8)}_${Date.now()}`,
      notes: { tenantId, purpose: "ONBOARDING", planId: active.id },
    });

    const wallet = await this.walletRepo.ensureWallet(tenantId);

    await this.rechargeRepo.create({
      walletId: wallet.id,
      tenantId,
      amount: active.onboardingFee,
      purpose: "ONBOARDING",
      status: "INITIATED",
      razorpayOrderId: order.orderId,
      planId: active.id,
    });

    return order;
  }
}
