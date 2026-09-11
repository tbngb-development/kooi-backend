import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../plans/application/interfaces/plan-repository.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import {
  TenantPlanNotFoundError,
  PlanNotActiveError,
} from "../../../plans/domain/errors/plan.errors";
import { AppError } from "../../../../shared/errors";
import { HttpStatus } from "../../../../shared/constants";
import type { CreateOrderInput, CreateOrderResult } from "../dto/payment.dto";

/**
 * Creates a Razorpay order for a wallet top-up recharge.
 * Validates the tenant has an active plan before allowing top-up.
 */
export class CreateOrderUseCase {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly walletRepo: WalletRepository,
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
  ) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!Number.isInteger(input.amountPaisa) || input.amountPaisa < 100) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Top-up amount must be an integer >= 100 paisa (₹1.00)",
        "INVALID_TOPUP_AMOUNT",
      );
    }

    // Verify tenant has an active plan
    const activePlan = await this.planRepo.getActivePlanForTenant(
      input.tenantId,
    );
    if (!activePlan) throw new TenantPlanNotFoundError(input.tenantId);
    if (activePlan.status !== "ACTIVE") throw new PlanNotActiveError();

    // Create Razorpay order
    const order = await this.payments.createOrder({
      amountPaisa: input.amountPaisa,
      receipt: `topup_${input.tenantId.slice(0, 8)}_${Date.now()}`,
      notes: {
        tenantId: input.tenantId,
        purpose: "WALLET_TOPUP",
      },
    });

    // Ensure wallet exists
    const wallet = await this.walletRepo.ensureWallet(input.tenantId);

    // Create recharge record
    const recharge = await this.rechargeRepo.create({
      walletId: wallet.id,
      tenantId: input.tenantId,
      amount: input.amountPaisa,
      purpose: "WALLET_TOPUP",
      status: "INITIATED",
      razorpayOrderId: order.orderId,
      tenantPlanId: null, // top-up is not tied to a specific plan
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
