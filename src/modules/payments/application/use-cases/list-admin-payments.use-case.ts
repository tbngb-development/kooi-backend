import type { RechargePurpose, RechargeStatus } from "@prisma/client";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";

export interface ListAdminPaymentsInput {
  tenantId?: string;
  status?: RechargeStatus;
  purpose?: RechargePurpose;
  page: number;
  limit: number;
}

export interface AdminPaymentItem {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  currency: string;
  purpose: string;
  status: string;
  provider: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ListAdminPaymentsResult {
  items: AdminPaymentItem[];
  total: number;
  page: number;
  limit: number;
}

export class ListAdminPaymentsUseCase {
  constructor(private readonly rechargeRepo: RechargeRepository) {}

  async execute(
    input: ListAdminPaymentsInput,
  ): Promise<ListAdminPaymentsResult> {
    const page = input.page > 0 ? input.page : 1;
    const limit = input.limit > 0 ? Math.min(input.limit, 100) : 50;

    const { items, total } = await this.rechargeRepo.listWithTenant(
      {
        tenantId: input.tenantId,
        status: input.status,
        purpose: input.purpose,
      },
      { page, limit },
    );

    return {
      items: items.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        amount: r.amount,
        currency: r.currency,
        purpose: r.purpose,
        status: r.status,
        provider: r.provider,
        razorpayOrderId: r.razorpayOrderId ?? null,
        razorpayPaymentId: r.razorpayPaymentId ?? null,
        failureReason: r.failureReason ?? null,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
    };
  }
}
