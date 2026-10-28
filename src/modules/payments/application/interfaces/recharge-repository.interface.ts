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
   * Atomically marks a recharge as SUCCESS if in a recoverable status
   * (INITIATED, CANCELLED, EXPIRED, FAILED).
   * Returns null if already SUCCESS or REFUNDED (idempotent guard).
   */
  markSuccess(
    rechargeId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<Recharge | null>;

  /**
   * Atomically marks a recharge as CANCELLED only if currently INITIATED.
   * Returns null if already transitioned or processed.
   */
  markCancelled(rechargeId: string, reason: string): Promise<Recharge | null>;

  /**
   * Atomically marks a recharge as EXPIRED only if currently INITIATED.
   * Returns null if already transitioned or processed.
   */
  markExpired(rechargeId: string, reason: string): Promise<Recharge | null>;

  markFailed(rechargeId: string, reason: string): Promise<Recharge>;

  updateFailureReason(rechargeId: string, reason: string): Promise<Recharge>;

  findStaleInitiated(cutoffDate: Date, limit: number): Promise<Recharge[]>;

  listWithTenant(
    filter: {
      tenantId?: string;
      status?: RechargeStatus;
      purpose?: RechargePurpose;
    },
    pagination: { page: number; limit: number },
  ): Promise<{ items: RechargeWithTenant[]; total: number }>;

  getSummary(tenantId?: string): Promise<{
    totalRecharges: number;
    totalAmountPaisa: number;
    successfulRecharges: number;
    failedRecharges: number;
  }>;
}
