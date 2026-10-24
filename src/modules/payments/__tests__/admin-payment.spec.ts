import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActivateFreeOnboardingUseCase } from "../application/use-cases/activate-free-onboarding.use-case";
import { ReconcilePaymentUseCase } from "../application/use-cases/reconcile-payment.use-case";
import { ListAdminPaymentsUseCase } from "../application/use-cases/list-admin-payments.use-case";
import {
  activateFreeOnboardingSchema,
  listAdminPaymentsQuerySchema,
} from "../presentation/payment.schema";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../wallet/application/interfaces/wallet-repository.interface";
import type { AutoAssignKeyUseCase } from "../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type { RechargeRepository, RechargeWithTenant } from "../application/interfaces/recharge-repository.interface";
import type { IPaymentProvider, OrderPayment } from "../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "../application/use-cases/complete-payment.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";
import { OnboardingFeeNotZeroError } from "../domain/errors/payment.errors";
import type { Recharge, TenantPlan } from "@prisma/client";
import type { TenantActivePlan } from "../../plans/application/interfaces/plan-repository.interface";

describe("Admin Payment Module — Unit Tests", () => {
  let mockPlanRepo: PlanRepository;
  let mockWalletRepo: WalletRepository;
  let mockAutoAssignKey: AutoAssignKeyUseCase;
  let mockRechargeRepo: RechargeRepository;
  let mockPaymentProvider: IPaymentProvider;
  let mockCompletePayment: CompletePaymentUseCase;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockPlanRepo = {
      getTenantPlan: vi.fn(),
      getActivePlanForTenant: vi.fn(),
      activatePlan: vi.fn(),
      findPlanById: vi.fn(),
      findVersionById: vi.fn(),
      listPlans: vi.fn(),
      findTenantPlan: vi.fn(),
      createPlan: vi.fn(),
      createVersion: vi.fn(),
      publishVersion: vi.fn(),
      archiveVersion: vi.fn(),
      assignPlanToTenant: vi.fn(),
      updateTenantPlanOverrides: vi.fn(),
      logTenantPlanEvent: vi.fn(),
      getPlanHistory: vi.fn(),
      getTenantPlanEvents: vi.fn(),
      countActiveSubscribers: vi.fn(),
    } as unknown as PlanRepository;

    mockWalletRepo = {
      findByTenantId: vi.fn(),
      ensureWallet: vi.fn(),
      create: vi.fn(),
      credit: vi.fn(),
      debit: vi.fn(),
      adjust: vi.fn(),
      listTransactions: vi.fn(),
      getStats: vi.fn(),
      findWalletsWithExpiredBonus: vi.fn(),
      expireBonus: vi.fn(),
      findTransactionByIdempotencyKey: vi.fn(),
    } as unknown as WalletRepository;

    mockAutoAssignKey = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as AutoAssignKeyUseCase;

    mockRechargeRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByRazorpayOrderId: vi.fn(),
      findByRazorpayPaymentId: vi.fn(),
      markSuccess: vi.fn(),
      markFailed: vi.fn(),
      listWithTenant: vi.fn(),
      getSummary: vi.fn(),
    } as unknown as RechargeRepository;

    mockPaymentProvider = {
      createOrder: vi.fn(),
      verifySignature: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      getOrderPayments: vi.fn(),
    };

    mockCompletePayment = {
      execute: vi.fn().mockResolvedValue({
        alreadyProcessed: false,
        rechargeId: "rec-123",
        purpose: "WALLET_TOPUP",
      }),
    } as unknown as CompletePaymentUseCase;
  });

  describe("ActivateFreeOnboardingUseCase", () => {
    it("should successfully activate plan with ₹0 onboarding fee without waiver reason", async () => {
      vi.mocked(mockPlanRepo.getTenantPlan).mockResolvedValue({
        id: "tp-1",
        tenantId: "tenant-1",
        planId: "plan-1",
        planVersionId: "pv-1",
        status: "PENDING_PAYMENT",
        onboardingFeeOverride: null,
        perMinuteRateOverride: null,
        activatedAt: null,
        bonusExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TenantPlan);

      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        planVersionId: "pv-1",
        planName: "Starter",
        onboardingFee: 0,
        perMinuteRate: 300,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
        includedBalance: 5000,
        bonusValidityDays: 30,
      } as unknown as TenantActivePlan);

      const useCase = new ActivateFreeOnboardingUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        adminUserId: "admin-1",
      });

      expect(result.tenantId).toBe("tenant-1");
      expect(result.includedBalance).toBe(5000);
      expect(mockPlanRepo.activatePlan).toHaveBeenCalledWith(
        "tenant-1",
        "pv-1",
        expect.any(Date),
        "admin-1",
      );
      expect(mockWalletRepo.credit).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          type: "BONUS",
          description: "Plan bonus — Starter (free onboarding)",
        }),
      );
    });

    it("should throw OnboardingFeeNotZeroError if fee > 0 and waiver reason is missing", async () => {
      vi.mocked(mockPlanRepo.getTenantPlan).mockResolvedValue({
        id: "tp-2",
        tenantId: "tenant-2",
        status: "PENDING_PAYMENT",
      } as unknown as TenantPlan);

      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        planVersionId: "pv-2",
        planName: "Enterprise Pro",
        onboardingFee: 4999900,
      } as unknown as TenantActivePlan);

      const useCase = new ActivateFreeOnboardingUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-2",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow(OnboardingFeeNotZeroError);
    });

    it("should throw OnboardingFeeNotZeroError if fee > 0 and waiver reason is too short", async () => {
      vi.mocked(mockPlanRepo.getTenantPlan).mockResolvedValue({
        id: "tp-2",
        tenantId: "tenant-2",
        status: "PENDING_PAYMENT",
      } as unknown as TenantPlan);

      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        planVersionId: "pv-2",
        planName: "Enterprise Pro",
        onboardingFee: 4999900,
      } as unknown as TenantActivePlan);

      const useCase = new ActivateFreeOnboardingUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-2",
          adminUserId: "admin-1",
          waiverReason: "too short",
        }),
      ).rejects.toThrow(OnboardingFeeNotZeroError);
    });

    it("should successfully activate plan with fee > 0 when contract waiver reason is provided", async () => {
      vi.mocked(mockPlanRepo.getTenantPlan).mockResolvedValue({
        id: "tp-3",
        tenantId: "tenant-3",
        status: "PENDING_PAYMENT",
      } as unknown as TenantPlan);

      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        planVersionId: "pv-3",
        planName: "Enterprise Scale",
        onboardingFee: 4999900,
        includedBalance: 100000,
        bonusValidityDays: 60,
      } as unknown as TenantActivePlan);

      const useCase = new ActivateFreeOnboardingUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      const result = await useCase.execute({
        tenantId: "tenant-3",
        adminUserId: "admin-1",
        waiverReason: "Signed Enterprise MSA #8921 approved by CFO",
      });

      expect(result.tenantId).toBe("tenant-3");
      expect(mockPlanRepo.activatePlan).toHaveBeenCalled();
      expect(mockWalletRepo.credit).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Plan bonus — Enterprise Scale (contract fee waiver)",
        }),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Onboarding fee waived by platform administrator",
        expect.objectContaining({
          waiverReason: "Signed Enterprise MSA #8921 approved by CFO",
          standardOnboardingFee: 4999900,
        }),
      );
    });
  });

  describe("ReconcilePaymentUseCase", () => {
    it("should return early if payment is already SUCCESS", async () => {
      vi.mocked(mockRechargeRepo.findById).mockResolvedValue({
        id: "rec-1",
        tenantId: "t-1",
        status: "SUCCESS",
        razorpayPaymentId: "pay_123",
      } as Recharge);

      const useCase = new ReconcilePaymentUseCase(
        mockRechargeRepo,
        mockPaymentProvider,
        mockCompletePayment,
        mockLogger,
      );

      const result = await useCase.execute({
        rechargeId: "rec-1",
        adminUserId: "admin-1",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reconciled).toBe(false);
      expect(mockPaymentProvider.getOrderPayments).not.toHaveBeenCalled();
    });

    it("should poll Razorpay and settle payment when captured payment is found", async () => {
      vi.mocked(mockRechargeRepo.findById).mockResolvedValue({
        id: "rec-2",
        tenantId: "t-2",
        status: "INITIATED",
        razorpayOrderId: "order_xyz_456",
        amount: 250000,
      } as Recharge);

      const capturedPayment: OrderPayment = {
        id: "pay_captured_789",
        status: "captured",
        amount: 250000,
        currency: "INR",
        method: "upi",
        captured: true,
        createdAt: 1700000000,
      };

      vi.mocked(mockPaymentProvider.getOrderPayments).mockResolvedValue([
        capturedPayment,
      ]);

      const useCase = new ReconcilePaymentUseCase(
        mockRechargeRepo,
        mockPaymentProvider,
        mockCompletePayment,
        mockLogger,
      );

      const result = await useCase.execute({
        rechargeId: "rec-2",
        adminUserId: "admin-1",
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.reconciled).toBe(true);
      expect(result.razorpayPaymentId).toBe("pay_captured_789");
      expect(mockCompletePayment.execute).toHaveBeenCalledWith({
        razorpayOrderId: "order_xyz_456",
        razorpayPaymentId: "pay_captured_789",
        razorpaySignature: "reconciled_by_admin_admin-1",
      });
    });

    it("should mark payment as FAILED when Razorpay confirms failed payment", async () => {
      vi.mocked(mockRechargeRepo.findById).mockResolvedValue({
        id: "rec-3",
        tenantId: "t-3",
        status: "INITIATED",
        razorpayOrderId: "order_failed_001",
      } as Recharge);

      const failedPayment: OrderPayment = {
        id: "pay_failed_999",
        status: "failed",
        amount: 10000,
        currency: "INR",
        method: "card",
        captured: false,
        createdAt: 1700000000,
      };

      vi.mocked(mockPaymentProvider.getOrderPayments).mockResolvedValue([
        failedPayment,
      ]);

      const useCase = new ReconcilePaymentUseCase(
        mockRechargeRepo,
        mockPaymentProvider,
        mockCompletePayment,
        mockLogger,
      );

      const result = await useCase.execute({
        rechargeId: "rec-3",
        adminUserId: "admin-1",
      });

      expect(result.status).toBe("FAILED");
      expect(result.reconciled).toBe(true);
      expect(mockRechargeRepo.markFailed).toHaveBeenCalledWith(
        "rec-3",
        expect.stringContaining("pay_failed_999"),
      );
    });
  });

  describe("ListAdminPaymentsUseCase", () => {
    it("should forward status and purpose filters and map all gateway fields", async () => {
      const mockRechargeWithTenant: RechargeWithTenant = {
        id: "rec-100",
        walletId: "w-1",
        tenantId: "t-100",
        tenantName: "Acme Real Estate",
        amount: 500000,
        currency: "INR",
        purpose: "WALLET_TOPUP",
        status: "SUCCESS",
        provider: "razorpay",
        razorpayOrderId: "order_mapped_111",
        razorpayPaymentId: "pay_mapped_222",
        razorpaySignature: "sig_mapped_333",
        failureReason: null,
        tenantPlanId: null,
        targetPlanVersionId: null,
        createdAt: new Date("2026-10-24T10:00:00Z"),
        completedAt: new Date("2026-10-24T10:02:00Z"),
      };

      vi.mocked(mockRechargeRepo.listWithTenant).mockResolvedValue({
        items: [mockRechargeWithTenant],
        total: 1,
      });

      const useCase = new ListAdminPaymentsUseCase(mockRechargeRepo);
      const result = await useCase.execute({
        tenantId: "t-100",
        status: "SUCCESS",
        purpose: "WALLET_TOPUP",
        page: 1,
        limit: 10,
      });

      expect(mockRechargeRepo.listWithTenant).toHaveBeenCalledWith(
        {
          tenantId: "t-100",
          status: "SUCCESS",
          purpose: "WALLET_TOPUP",
        },
        { page: 1, limit: 10 },
      );

      expect(result.items[0]).toEqual({
        id: "rec-100",
        tenantId: "t-100",
        tenantName: "Acme Real Estate",
        amount: 500000,
        currency: "INR",
        purpose: "WALLET_TOPUP",
        status: "SUCCESS",
        provider: "razorpay",
        razorpayOrderId: "order_mapped_111",
        razorpayPaymentId: "pay_mapped_222",
        failureReason: null,
        createdAt: "2026-10-24T10:00:00.000Z",
        completedAt: "2026-10-24T10:02:00.000Z",
      });
    });
  });

  describe("Payment Validation Schemas", () => {
    it("should validate activateFreeOnboardingSchema with valid UUID and waiverReason", () => {
      const valid = activateFreeOnboardingSchema.safeParse({
        tenantId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        waiverReason: "Signed MSA agreement approved by leadership",
      });
      expect(valid.success).toBe(true);

      const invalidReason = activateFreeOnboardingSchema.safeParse({
        tenantId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        waiverReason: "short",
      });
      expect(invalidReason.success).toBe(false);
    });

    it("should validate listAdminPaymentsQuerySchema", () => {
      const valid = listAdminPaymentsQuerySchema.safeParse({
        status: "SUCCESS",
        purpose: "ONBOARDING",
        page: "2",
        limit: "25",
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.page).toBe(2);
        expect(valid.data.limit).toBe(25);
      }
    });
  });
});
