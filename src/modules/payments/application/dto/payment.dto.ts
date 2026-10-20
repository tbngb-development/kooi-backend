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

// ── Razorpay Webhook Typed DTOs ───────────────────────────────

export type RazorpayPaymentMethod =
  | "upi"
  | "netbanking"
  | "card"
  | "wallet"
  | "emi"
  | "bank_transfer"
  | "cod"
  | string;

export interface RazorpayCardDetails {
  id?: string;
  entity?: "card";
  name?: string | null;
  last4?: string;
  network?: string;
  type?: string;
  sub_type?: string;
  issuer?: string | null;
  international?: boolean;
  emi?: boolean;
}

export interface RazorpayUpiDetails {
  payer_account_type?: string;
  vpa?: string;
  flow?: string;
}

export interface RazorpayAcquirerData {
  rrn?: string | null;
  bank_transaction_id?: string | null;
  auth_code?: string | null;
  transaction_id?: string | null;
  [key: string]: unknown;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: "authorized" | "captured" | "failed" | "pending" | string;
  order_id: string | null;
  invoice_id?: string | null;
  international?: boolean;
  method?: RazorpayPaymentMethod;
  amount_refunded?: number;
  refund_status?: string | null;
  captured?: boolean;
  description?: string | null;
  card_id?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  email?: string | null;
  contact?: string | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_reason?: string | null;
  acquirer_data?: RazorpayAcquirerData | null;
  card?: RazorpayCardDetails | null;
  upi?: RazorpayUpiDetails | null;
  created_at?: number;
}

export interface RazorpayOrderEntity {
  id: string;
  entity: "order";
  amount: number;
  amount_paid?: number;
  amount_due?: number;
  currency: string;
  status: "created" | "attempted" | "paid" | string;
  attempts?: number;
  created_at?: number;
}

export interface RazorpayWebhookPayload {
  entity?: string;
  account_id?: string;
  event: string;
  contains?: string[];
  payload: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrderEntity;
    };
    [key: string]: unknown;
  };
  created_at?: number;
}

export interface ExtractedPaymentDetails {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  method: RazorpayPaymentMethod;
  status: string;
  acquirerReference: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  card: {
    network?: string;
    last4?: string;
    type?: string;
  } | null;
  feePaisa: number | null;
  taxPaisa: number | null;
}

