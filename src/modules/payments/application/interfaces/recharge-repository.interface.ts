import type { Recharge, RechargePurpose, RechargeStatus } from "@prisma/client";

export interface CreateRechargeData {
  walletId: string;
  tenantId: string;
  amount: number;
  currency?: string;
  purpose: RechargePurpose;
  status: RechargeStatus;
  provider?: string;
  razorpayOrderId?: string | null;
  tenantPlanId?: string | null;
  targetPlanVersionId?: string | null;
}

export interface RechargeWithTenant extends Recharge {
  tenantName: string;
}

export interface RechargeRepository {
  create(data: CreateRechargeData): Promise<Recharge>;
  findById(id: string): Promise<Recharge | null>;
  findByRazorpayOrderId(orderId: string): Promise<Recharge | null>;
  findByRazorpayPaymentId(paymentId: string): Promise<Recharge | null>;

  /**
   * Atomically marks a recharge as SUCCESS only if currently INITIATED.
   * Returns null if already processed (idempotent guard).
   */
  markSuccess(
    rechargeId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<Recharge | null>;

  markFailed(rechargeId: string, reason: string): Promise<Recharge>;

  listWithTenant(
    filter: { tenantId?: string; status?: RechargeStatus },
    pagination: { page: number; limit: number },
  ): Promise<{ items: RechargeWithTenant[]; total: number }>;

  getSummary(tenantId?: string): Promise<{
    totalRecharges: number;
    totalAmountPaisa: number;
    successfulRecharges: number;
    failedRecharges: number;
  }>;
}
