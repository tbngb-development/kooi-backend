import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReconcileStalePaymentsUseCase } from "../application/use-cases/reconcile-stale-payments.use-case";
import { PaymentReconciliationScheduler } from "../infrastructure/jobs/payment-reconciliation.scheduler";
import type { RechargeRepository } from "../application/interfaces/recharge-repository.interface";
import type {
  IPaymentProvider,
  OrderPayment,
} from "../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "../application/use-cases/complete-payment.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";
import type { Recharge } from "@prisma/client";

describe("ReconcileStalePaymentsUseCase & Scheduler", () => {
  let mockRechargeRepo: RechargeRepository;
  let mockPayments: IPaymentProvider;
  let mockCompletePayment: CompletePaymentUseCase;
  let mockLogger: Logger;
  let useCase: ReconcileStalePaymentsUseCase;

  const createStaleRecharge = (id: string, orderId: string | null): Recharge => ({
    id,
    walletId: `wal_${id}`,
    tenantId: "tenant_abc",
    amount: 50000,
    currency: "INR",
    purpose: "WALLET_TOPUP",
    status: "INITIATED",
    provider: "razorpay",
    razorpayOrderId: orderId,
    razorpayPaymentId: null,
    razorpaySignature: null,
    failureReason: null,
    tenantPlanId: null,
    targetPlanVersionId: null,
    createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
    completedAt: null,
  });

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockRechargeRepo = {
      findById: vi.fn(),
      findByRazorpayOrderId: vi.fn(),
      findByRazorpayPaymentId: vi.fn(),
      create: vi.fn(),
      markSuccess: vi.fn(),
      markCancelled: vi.fn(),
      markExpired: vi.fn(),
      markFailed: vi.fn(),
      updateFailureReason: vi.fn(),
      findStaleInitiated: vi.fn(),
      listWithTenant: vi.fn(),
      getSummary: vi.fn(),
    };

    mockPayments = {
      createOrder: vi.fn(),
      verifySignature: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      getOrderPayments: vi.fn(),
      capturePayment: vi.fn(),
    };

    mockCompletePayment = {
      execute: vi.fn(),
    } as unknown as CompletePaymentUseCase;

    useCase = new ReconcileStalePaymentsUseCase(
      mockRechargeRepo,
      mockPayments,
      mockCompletePayment,
      mockLogger,
    );
  });

  it("expires stale recharges with missing razorpayOrderId", async () => {
    const staleMissingOrder = createStaleRecharge("rec_1", null);
    vi.mocked(mockRechargeRepo.findStaleInitiated).mockResolvedValue([
      staleMissingOrder,
    ]);

    const result = await useCase.execute({ timeoutMinutes: 30 });

    expect(result.scannedCount).toBe(1);
    expect(result.reconciledExpiredCount).toBe(1);
    expect(mockRechargeRepo.markExpired).toHaveBeenCalledWith(
      "rec_1",
      expect.stringContaining("Missing Razorpay order ID"),
    );
  });

  it("fulfills payment as SUCCESS when gateway reports captured payment", async () => {
    const stale = createStaleRecharge("rec_2", "order_captured_123");
    vi.mocked(mockRechargeRepo.findStaleInitiated).mockResolvedValue([stale]);

    const capturedPayment: OrderPayment = {
      id: "pay_captured_999",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "upi",
      captured: true,
      createdAt: Math.floor(Date.now() / 1000),
    };
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([
      capturedPayment,
    ]);

    const result = await useCase.execute();

    expect(result.reconciledSuccessCount).toBe(1);
    expect(mockCompletePayment.execute).toHaveBeenCalledWith({
      razorpayOrderId: "order_captured_123",
      razorpayPaymentId: "pay_captured_999",
      razorpaySignature: "reconciled_stale_batch",
    });
  });

  it("auto-captures authorized payment and completes as SUCCESS", async () => {
    const stale = createStaleRecharge("rec_3", "order_auth_123");
    vi.mocked(mockRechargeRepo.findStaleInitiated).mockResolvedValue([stale]);

    const authorizedPayment: OrderPayment = {
      id: "pay_auth_888",
      status: "authorized",
      amount: 50000,
      currency: "INR",
      method: "card",
      captured: false,
      createdAt: Math.floor(Date.now() / 1000),
    };
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([
      authorizedPayment,
    ]);

    const capturedPayment: OrderPayment = {
      ...authorizedPayment,
      status: "captured",
      captured: true,
    };
    vi.mocked(mockPayments.capturePayment).mockResolvedValue(capturedPayment);

    const result = await useCase.execute();

    expect(result.reconciledSuccessCount).toBe(1);
    expect(mockPayments.capturePayment).toHaveBeenCalledWith(
      "pay_auth_888",
      50000,
      "INR",
    );
    expect(mockCompletePayment.execute).toHaveBeenCalledWith({
      razorpayOrderId: "order_auth_123",
      razorpayPaymentId: "pay_auth_888",
      razorpaySignature: "reconciled_stale_autocapture",
    });
  });

  it("marks as FAILED when all gateway attempts have failed", async () => {
    const stale = createStaleRecharge("rec_4", "order_failed_123");
    vi.mocked(mockRechargeRepo.findStaleInitiated).mockResolvedValue([stale]);

    const failedPayment: OrderPayment = {
      id: "pay_failed_777",
      status: "failed",
      amount: 50000,
      currency: "INR",
      method: "upi",
      captured: false,
      createdAt: Math.floor(Date.now() / 1000),
    };
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([failedPayment]);

    const result = await useCase.execute();

    expect(result.reconciledFailedCount).toBe(1);
    expect(mockRechargeRepo.markFailed).toHaveBeenCalledWith(
      "rec_4",
      expect.stringContaining("pay_failed_777 failed on Razorpay"),
    );
  });

  it("marks as EXPIRED when no payment attempts exist on gateway (abandoned)", async () => {
    const stale = createStaleRecharge("rec_5", "order_abandoned_123");
    vi.mocked(mockRechargeRepo.findStaleInitiated).mockResolvedValue([stale]);
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.reconciledExpiredCount).toBe(1);
    expect(mockRechargeRepo.markExpired).toHaveBeenCalledWith(
      "rec_5",
      "Checkout abandoned — pending timeout exceeded",
    );
  });

  it("scheduler runs sweep on start and stops gracefully", async () => {
    vi.mocked(mockRechargeRepo.findStaleInitiated).mockResolvedValue([]);
    const scheduler = new PaymentReconciliationScheduler(
      useCase,
      mockLogger,
      "*/15 * * * *",
      30,
    );

    scheduler.start();
    // Verify sweep called
    expect(mockRechargeRepo.findStaleInitiated).toHaveBeenCalled();

    scheduler.stop();
  });
});

