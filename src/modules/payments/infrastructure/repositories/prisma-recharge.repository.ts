import prisma from "../../../../shared/config/database/prisma";
import type { Recharge, RechargeStatus } from "@prisma/client";
import type {
  RechargeRepository,
  CreateRechargeData,
  RechargeWithTenant,
} from "../../application/interfaces/recharge-repository.interface";

export class PrismaRechargeRepository implements RechargeRepository {
  async create(data: CreateRechargeData): Promise<Recharge> {
    return prisma.recharge.create({
      data: {
        walletId: data.walletId,
        tenantId: data.tenantId,
        amount: data.amount,
        currency: data.currency ?? "INR",
        purpose: data.purpose,
        status: data.status,
        provider: data.provider ?? "razorpay",
        razorpayOrderId: data.razorpayOrderId ?? null,
        tenantPlanId: data.tenantPlanId ?? null,
        targetPlanVersionId: data.targetPlanVersionId ?? null,
      },
    });
  }

  async findById(id: string): Promise<Recharge | null> {
    return prisma.recharge.findUnique({ where: { id } });
  }

  async findByRazorpayOrderId(orderId: string): Promise<Recharge | null> {
    return prisma.recharge.findUnique({
      where: { razorpayOrderId: orderId },
    });
  }

  async findByRazorpayPaymentId(paymentId: string): Promise<Recharge | null> {
    return prisma.recharge.findUnique({
      where: { razorpayPaymentId: paymentId },
    });
  }

  async markSuccess(
    rechargeId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<Recharge> {
    return prisma.recharge.update({
      where: { id: rechargeId },
      data: {
        status: "SUCCESS",
        razorpayPaymentId,
        razorpaySignature,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(rechargeId: string, reason: string): Promise<Recharge> {
    return prisma.recharge.update({
      where: { id: rechargeId },
      data: {
        status: "FAILED",
        failureReason: reason,
      },
    });
  }

  async listWithTenant(
    filter: { tenantId?: string; status?: RechargeStatus },
    pagination: { page: number; limit: number },
  ): Promise<{ items: RechargeWithTenant[]; total: number }> {
    const skip = (pagination.page - 1) * pagination.limit;
    const where = {
      ...(filter.tenantId && { tenantId: filter.tenantId }),
      ...(filter.status && { status: filter.status }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.recharge.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pagination.limit,
        include: {
          wallet: {
            include: {
              tenant: {
                select: { name: true },
              },
            },
          },
        },
      }),
      prisma.recharge.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        ...r,
        tenantName: r.wallet.tenant.name,
      })),
      total,
    };
  }

  async getSummary(tenantId?: string): Promise<{
    totalRecharges: number;
    totalAmountPaisa: number;
    successfulRecharges: number;
    failedRecharges: number;
  }> {
    const where = tenantId ? { tenantId } : {};

    const [totalRecharges, successAgg, failedCount] = await prisma.$transaction(
      [
        prisma.recharge.count({ where }),
        prisma.recharge.aggregate({
          where: { ...where, status: "SUCCESS" },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.recharge.count({ where: { ...where, status: "FAILED" } }),
      ],
    );

    return {
      totalRecharges,
      totalAmountPaisa: successAgg._sum.amount ?? 0,
      successfulRecharges: successAgg._count,
      failedRecharges: failedCount,
    };
  }
}
