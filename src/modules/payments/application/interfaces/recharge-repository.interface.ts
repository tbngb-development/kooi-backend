import type {
  Recharge,
  RechargeStatus,
  RechargePurpose,
} from "@prisma/client";

// ── Entity types ──────────────────────────────────────────────
export type RechargeEntity = Recharge;

export interface RechargeWithTenant extends RechargeEntity {
  tenantName: string;
}

// ── Input types ───────────────────────────────────────────────
export interface CreateRechargeData {
  walletId: string;
  tenantId: string;
  amount: number;
  purpose: RechargePurpose;
  status: RechargeStatus;
  razorpayOrderId: string;
  planId: string | null;
}

export interface ListRechargeFilters {
  tenantId?: string;
  status?: RechargeStatus;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface PaymentSummary {
  totalRevenuePaisa: number;
  mrrApproxPaisa: number;
  failedCount: number;
  successCount: number;
}

// ── Repository contract ───────────────────────────────────────
export interface RechargeRepository {
  create(data: CreateRechargeData): Promise<RechargeEntity>;

  findByRazorpayOrderId(orderId: string): Promise<RechargeEntity | null>;

  markSuccess(id: string, paymentId: string, signature: string): Promise<void>;

  /** Admin: aggregated revenue / counts */
  getSummary(): Promise<PaymentSummary>;

  /** Admin: paginated list with tenant name */
  listWithTenant(
    filters: ListRechargeFilters,
    pagination: Pagination,
  ): Promise<{ items: RechargeWithTenant[]; total: number }>;
}
