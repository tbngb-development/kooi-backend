import type { RechargeStatus } from "@prisma/client";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";

export interface ListAdminPaymentsInput {
  tenantId?: string;
  status?: RechargeStatus;
  page: number;
  limit: number;
}

export interface AdminPaymentItem {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  purpose: string;
  status: string;
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
      { tenantId: input.tenantId, status: input.status },
      { page, limit },
    );

    return {
      items: items.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        amount: r.amount,
        purpose: r.purpose,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
    };
  }
}
