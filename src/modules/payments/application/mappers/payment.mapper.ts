import type { Recharge, TenantPlan } from "@prisma/client";
import type { TenantPaymentResponse } from "../dto/payment.dto";

type RechargeWithOptionalPlan = Recharge & {
  tenantPlan?: TenantPlan | null;
};

export function toTenantPaymentResponse(
  recharge: RechargeWithOptionalPlan,
): TenantPaymentResponse {
  return {
    id: recharge.id,
    walletId: recharge.walletId,
    tenantId: recharge.tenantId,
    amount: recharge.amount,
    currency: recharge.currency,
    purpose: recharge.purpose,
    status: recharge.status,
    provider: recharge.provider,
    paymentMethod: recharge.paymentMethod ?? null,
    razorpayOrderId: recharge.razorpayOrderId ?? null,
    razorpayPaymentId: recharge.razorpayPaymentId ?? null,
    failureReason: recharge.failureReason ?? null,
    tenantPlanId: recharge.tenantPlanId ?? null,
    targetPlanVersionId: recharge.targetPlanVersionId ?? null,
    createdAt: recharge.createdAt.toISOString(),
    completedAt: recharge.completedAt ? recharge.completedAt.toISOString() : null,
    tenantPlan: recharge.tenantPlan
      ? {
          id: recharge.tenantPlan.id,
          status: recharge.tenantPlan.status,
        }
      : null,
  };
}

