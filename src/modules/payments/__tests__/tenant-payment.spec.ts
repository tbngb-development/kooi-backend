import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListTenantPaymentsUseCase } from "../application/use-cases/list-tenant-payments.use-case";
import { GetTenantPaymentDetailUseCase } from "../application/use-cases/get-tenant-payment-detail.use-case";
import type { RechargeRepository } from "../application/interfaces/recharge-repository.interface";
import type { Recharge } from "@prisma/client";
import { RechargeNotFoundError } from "../domain/errors/payment.errors";

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
