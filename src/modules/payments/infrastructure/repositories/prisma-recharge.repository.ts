import prisma from "../../../../shared/config/database/prisma";
import type { Recharge, RechargePurpose, RechargeStatus } from "@prisma/client";
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

  /**
   * Atomically marks a recharge as SUCCESS if it is in a recoverable state
   * (INITIATED, CANCELLED, EXPIRED, FAILED).
   *
   * Returns the updated Recharge on success, or null if the recharge was
   * already processed as SUCCESS or REFUNDED.
   * This supports late capture/webhook delivery while guaranteeing idempotency.
   */
  async markSuccess(
    rechargeId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<Recharge | null> {
    const result = await prisma.recharge.updateMany({
      where: {
        id: rechargeId,
        status: { in: ["INITIATED", "CANCELLED", "EXPIRED", "FAILED"] },
      },
      data: {
        status: "SUCCESS",
        razorpayPaymentId,
        razorpaySignature,
        completedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null; // Already SUCCESS, REFUNDED, or doesn't exist
    }

    return prisma.recharge.findUniqueOrThrow({ where: { id: rechargeId } });
  }

  /**
   * Atomically marks a recharge as CANCELLED only if it is still INITIATED.
   * Returns null if it was already processed or reached a terminal/success state.
   */
  async markCancelled(
    rechargeId: string,
    reason: string,
  ): Promise<Recharge | null> {
    const result = await prisma.recharge.updateMany({
      where: {
        id: rechargeId,
        status: "INITIATED",
      },
      data: {
        status: "CANCELLED",
        failureReason: reason,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return prisma.recharge.findUniqueOrThrow({ where: { id: rechargeId } });
  }

  /**
   * Atomically marks a recharge as EXPIRED only if it is still INITIATED.
   * Returns null if it was already processed or reached a terminal/success state.
   */
  async markExpired(
    rechargeId: string,
    reason: string,
  ): Promise<Recharge | null> {
    const result = await prisma.recharge.updateMany({
      where: {
        id: rechargeId,
        status: "INITIATED",
      },
      data: {
        status: "EXPIRED",
        failureReason: reason,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return prisma.recharge.findUniqueOrThrow({ where: { id: rechargeId } });
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

  async updateFailureReason(
    rechargeId: string,
    reason: string,
  ): Promise<Recharge> {
    return prisma.recharge.update({
      where: { id: rechargeId },
      data: {
        failureReason: reason,
      },
    });
  }

  async findStaleInitiated(
    cutoffDate: Date,
    limit: number,
  ): Promise<Recharge[]> {
    return prisma.recharge.findMany({
      where: {
        status: "INITIATED",
        createdAt: { lte: cutoffDate },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async listWithTenant(
    filter: {
      tenantId?: string;
      status?: RechargeStatus;
      purpose?: RechargePurpose;
    },
    pagination: { page: number; limit: number },
  ): Promise<{ items: RechargeWithTenant[]; total: number }> {
    const skip = (pagination.page - 1) * pagination.limit;
    const where = {
      ...(filter.tenantId && { tenantId: filter.tenantId }),
      ...(filter.status && { status: filter.status }),
      ...(filter.purpose && { purpose: filter.purpose }),
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
