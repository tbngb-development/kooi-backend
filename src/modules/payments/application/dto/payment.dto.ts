import type { RechargeStatus, RechargePurpose } from "@prisma/client";

export interface CreateOrderInput {
  tenantId: string;
  amountPaisa: number;
}

export interface CreateOnboardingOrderInput {
  tenantId: string;
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  rechargeId: string;
}

export interface VerifyPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface CompletePaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface CompletePaymentResult {
  alreadyProcessed: boolean;
  rechargeId: string;
  purpose: RechargePurpose;
}

export interface WebhookInput {
  rawBody: string;
  signature: string;
}

export interface RechargeResponse {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  purpose: RechargePurpose;
  status: RechargeStatus;
  provider: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  tenantPlanId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PaymentSummaryResponse {
  totalRecharges: number;
  totalAmountPaisa: number;
  successfulRecharges: number;
  failedRecharges: number;
}

export interface ActivateFreeOnboardingInput {
  tenantId: string;
  adminUserId: string;
}

export interface ActivateFreeOnboardingResult {
  tenantId: string;
  planVersionId: string;
  includedBalance: number;
  bonusExpiresAt: string | null;
}
