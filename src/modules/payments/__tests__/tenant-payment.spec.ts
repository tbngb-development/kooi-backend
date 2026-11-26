import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListTenantPaymentsUseCase } from "../application/use-cases/list-tenant-payments.use-case";
import { GetTenantPaymentDetailUseCase } from "../application/use-cases/get-tenant-payment-detail.use-case";
import type { RechargeRepository } from "../application/interfaces/recharge-repository.interface";
import type { Recharge } from "@prisma/client";
import { RechargeNotFoundError } from "../domain/errors/payment.errors";
import prisma from "../../../shared/config/database/prisma";
import { PrismaRechargeRepository } from "../infrastructure/repositories/prisma-recharge.repository";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    recharge: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("Tenant Payment Use Cases", () => {
  let mockRechargeRepo: RechargeRepository;

  beforeEach(() => {
    mockRechargeRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      findByRazorpayOrderId: vi.fn(),
      findByRazorpayPaymentId: vi.fn(),
      markSuccess: vi.fn(),
      markCancelled: vi.fn(),
      markExpired: vi.fn(),
      markFailed: vi.fn(),
      updateFailureReason: vi.fn(),
      findStaleInitiated: vi.fn(),
      listTenantRecharges: vi.fn(),
      listWithTenant: vi.fn(),
      getSummary: vi.fn(),
    };
  });

  describe("ListTenantPaymentsUseCase", () => {
    it("should query recharges scoped to tenant with filters and pagination", async () => {
      const useCase = new ListTenantPaymentsUseCase(mockRechargeRepo);

      const fakeRecharge: Recharge = {
        id: "rec_1",
        walletId: "wal_1",
        tenantId: "tenant_1",
        amount: 50000,
        currency: "INR",
        purpose: "WALLET_TOPUP",
        status: "SUCCESS",
        provider: "razorpay",
        paymentMethod: "upi",
        razorpayOrderId: "order_123",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "sig_123",
        failureReason: null,
        tenantPlanId: null,
        targetPlanVersionId: null,
        createdAt: new Date("2026-11-01T10:00:00Z"),
        completedAt: new Date("2026-11-01T10:02:00Z"),
      };

      vi.mocked(mockRechargeRepo.listTenantRecharges).mockResolvedValue({
        items: [fakeRecharge],
        total: 1,
      });

      const result = await useCase.execute("tenant_1", {
        page: 1,
        limit: 10,
        status: "SUCCESS",
        search: "order_123",
      });

      expect(mockRechargeRepo.listTenantRecharges).toHaveBeenCalledWith(
        "tenant_1",
        expect.objectContaining({
          page: 1,
          limit: 10,
          status: "SUCCESS",
          search: "order_123",
        }),
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("rec_1");
      expect(result.items[0].paymentMethod).toBe("upi");
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it("should handle historical records with null paymentMethod gracefully", async () => {
      const useCase = new ListTenantPaymentsUseCase(mockRechargeRepo);

      const historicalRecharge: Recharge = {
        id: "rec_old",
        walletId: "wal_1",
        tenantId: "tenant_1",
        amount: 25000,
        currency: "INR",
        purpose: "WALLET_TOPUP",
        status: "SUCCESS",
        provider: "razorpay",
        paymentMethod: null,
        razorpayOrderId: "order_old",
        razorpayPaymentId: "pay_old",
        razorpaySignature: "sig_old",
        failureReason: null,
        tenantPlanId: null,
        targetPlanVersionId: null,
        createdAt: new Date("2026-09-01T10:00:00Z"),
        completedAt: new Date("2026-09-01T10:05:00Z"),
      };

      vi.mocked(mockRechargeRepo.listTenantRecharges).mockResolvedValue({
        items: [historicalRecharge],
        total: 1,
      });

      const result = await useCase.execute("tenant_1", { page: 1, limit: 10 });
      expect(result.items[0].paymentMethod).toBeNull();
    });
  });

  describe("GetTenantPaymentDetailUseCase", () => {
    it("should return detailed payment for matching tenantId", async () => {
      const useCase = new GetTenantPaymentDetailUseCase(mockRechargeRepo);

      const fakeRecharge = {
        id: "rec_detail_1",
        walletId: "wal_1",
        tenantId: "tenant_1",
        amount: 100000,
        currency: "INR",
        purpose: "WALLET_TOPUP",
        status: "SUCCESS",
        provider: "razorpay",
        paymentMethod: "card",
        razorpayOrderId: "order_card_1",
        razorpayPaymentId: "pay_card_1",
        razorpaySignature: "sig_card_1",
        failureReason: null,
        tenantPlanId: null,
        targetPlanVersionId: null,
        createdAt: new Date("2026-11-01T12:00:00Z"),
        completedAt: new Date("2026-11-01T12:01:00Z"),
        tenantPlan: null,
      } as Recharge;

      vi.mocked(mockRechargeRepo.findByIdAndTenantId).mockResolvedValue(fakeRecharge);

      const result = await useCase.execute("rec_detail_1", "tenant_1");

      expect(mockRechargeRepo.findByIdAndTenantId).toHaveBeenCalledWith(
        "rec_detail_1",
        "tenant_1",
      );
      expect(result.id).toBe("rec_detail_1");
      expect(result.paymentMethod).toBe("card");
    });

    it("should throw RechargeNotFoundError on tenant mismatch (strict tenant isolation)", async () => {
      const useCase = new GetTenantPaymentDetailUseCase(mockRechargeRepo);

      vi.mocked(mockRechargeRepo.findByIdAndTenantId).mockResolvedValue(null);

      await expect(
        useCase.execute("rec_detail_1", "tenant_attacker"),
      ).rejects.toThrow(RechargeNotFoundError);
    });
  });
});

describe("Recharge repository status filtering", () => {
  let repo: PrismaRechargeRepository;

  const successRecharge: Recharge = {
    id: "rec_success",
    walletId: "wal_1",
    tenantId: "tenant_1",
    amount: 50000,
    currency: "INR",
    purpose: "WALLET_TOPUP",
    status: "SUCCESS",
    provider: "razorpay",
    paymentMethod: null,
    razorpayOrderId: "order_success",
    razorpayPaymentId: "pay_success",
    razorpaySignature: "sig_success",
    failureReason: null,
    tenantPlanId: null,
    targetPlanVersionId: null,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    completedAt: new Date("2026-11-01T10:02:00Z"),
  };

  const cancelledRecharge = {
    ...successRecharge,
    id: "rec_cancelled",
    status: "CANCELLED" as const,
    razorpayOrderId: "order_cancelled",
    razorpayPaymentId: null,
    razorpaySignature: null,
    completedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaRechargeRepository();
    // Resolve the two queued Prisma promises in order (findMany, count).
    (prisma.$transaction as any).mockImplementation((queries: unknown[]) =>
      Promise.all(queries),
    );
  });

  it("excludes CANCELLED rows from tenant items and count, including paginated pages", async () => {
    (prisma.recharge.findMany as any).mockResolvedValue([successRecharge]);
    (prisma.recharge.count as any).mockResolvedValue(1);

    const result = await repo.listTenantRecharges("tenant_1", {
      page: 2,
      limit: 1,
    });

    const findManyArgs = (prisma.recharge.findMany as any).mock.calls[0][0];
    const countArgs = (prisma.recharge.count as any).mock.calls[0][0];

    expect(findManyArgs.where.status).toEqual({ not: "CANCELLED" });
    expect(countArgs.where.status).toEqual({ not: "CANCELLED" });
    expect(findManyArgs.skip).toBe(1);
    expect(findManyArgs.take).toBe(1);
    expect(result.items).toEqual([successRecharge]);
    expect(result.items.every((item) => item.status !== "CANCELLED")).toBe(true);
    expect(result.total).toBe(1);
  });

  it("still excludes CANCELLED rows when tenant history explicitly requests that status", async () => {
    (prisma.recharge.findMany as any).mockResolvedValue([]);
    (prisma.recharge.count as any).mockResolvedValue(0);

    const result = await repo.listTenantRecharges("tenant_1", {
      page: 1,
      limit: 10,
      status: "CANCELLED",
    });

    const findManyArgs = (prisma.recharge.findMany as any).mock.calls[0][0];
    const countArgs = (prisma.recharge.count as any).mock.calls[0][0];

    expect(findManyArgs.where.status).toEqual({ not: "CANCELLED" });
    expect(countArgs.where.status).toEqual({ not: "CANCELLED" });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it("keeps CANCELLED rows visible in the admin tenant payment list when requested", async () => {
    (prisma.recharge.findMany as any).mockResolvedValue([
      {
        ...cancelledRecharge,
        wallet: { tenant: { name: "Tenant One" } },
      },
    ]);
    (prisma.recharge.count as any).mockResolvedValue(1);

    const result = await repo.listWithTenant(
      { tenantId: "tenant_1", status: "CANCELLED" },
      { page: 1, limit: 10 },
    );

    const findManyArgs = (prisma.recharge.findMany as any).mock.calls[0][0];
    const countArgs = (prisma.recharge.count as any).mock.calls[0][0];

    expect(findManyArgs.where).toEqual({
      tenantId: "tenant_1",
      status: "CANCELLED",
    });
    expect(countArgs.where).toEqual({
      tenantId: "tenant_1",
      status: "CANCELLED",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("CANCELLED");
    expect(result.total).toBe(1);
  });
});
