import { describe, it, expect, vi, beforeEach } from "vitest";
import { CancelPaymentUseCase } from "../application/use-cases/cancel-payment.use-case";
import { RechargeNotFoundError } from "../domain/errors/payment.errors";
import type { RechargeRepository } from "../application/interfaces/recharge-repository.interface";
import type {
  IPaymentProvider,
  OrderPayment,
} from "../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "../application/use-cases/complete-payment.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";
import type { Recharge } from "@prisma/client";

describe("CancelPaymentUseCase", () => {
  let mockRechargeRepo: RechargeRepository;
  let mockPayments: IPaymentProvider;
  let mockCompletePayment: CompletePaymentUseCase;
  let mockLogger: Logger;
  let useCase: CancelPaymentUseCase;

  const mockRecharge: Recharge = {
    id: "rec_123",
    walletId: "wal_123",
    tenantId: "tenant_abc",
    amount: 10000,
    currency: "INR",
    purpose: "WALLET_TOPUP",
    status: "INITIATED",
    provider: "razorpay",
    razorpayOrderId: "order_rzp_999",
    razorpayPaymentId: null,
    razorpaySignature: null,
    failureReason: null,
    tenantPlanId: null,
    targetPlanVersionId: null,
    createdAt: new Date(),
    completedAt: null,
  };

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

    useCase = new CancelPaymentUseCase(
      mockRechargeRepo,
      mockPayments,
      mockCompletePayment,
      mockLogger,
    );
  });

  it("throws RechargeNotFoundError when order is not found", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: "tenant_abc",
        razorpayOrderId: "order_non_existent",
      }),
    ).rejects.toThrow(RechargeNotFoundError);
  });

  it("throws RechargeNotFoundError when tenantId does not match (tenant isolation)", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue(
      mockRecharge,
    );

    await expect(
      useCase.execute({
        tenantId: "tenant_intruder",
        razorpayOrderId: "order_rzp_999",
      }),
    ).rejects.toThrow(RechargeNotFoundError);
  });

  it("returns early if recharge is already SUCCESS (idempotency)", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue({
      ...mockRecharge,
      status: "SUCCESS",
      razorpayPaymentId: "pay_captured_already",
    });

    const result = await useCase.execute({
      tenantId: "tenant_abc",
      razorpayOrderId: "order_rzp_999",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.alreadyProcessed).toBe(true);
    expect(mockPayments.getOrderPayments).not.toHaveBeenCalled();
  });

  it("fulfills as SUCCESS if Razorpay gateway reports payment was actually captured", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue(
      mockRecharge,
    );
    const capturedPayment: OrderPayment = {
      id: "pay_live_captured",
      status: "captured",
      amount: 10000,
      currency: "INR",
      method: "upi",
      captured: true,
      createdAt: Math.floor(Date.now() / 1000),
    };
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([
      capturedPayment,
    ]);

    const result = await useCase.execute({
      tenantId: "tenant_abc",
      razorpayOrderId: "order_rzp_999",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.razorpayPaymentId).toBe("pay_live_captured");
    expect(mockCompletePayment.execute).toHaveBeenCalledWith({
      razorpayOrderId: "order_rzp_999",
      razorpayPaymentId: "pay_live_captured",
      razorpaySignature: "verified_on_cancel_dismissal",
    });
    expect(mockRechargeRepo.markCancelled).not.toHaveBeenCalled();
  });

  it("retains INITIATED if a payment attempt is in-flight (authorized/pending)", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue(
      mockRecharge,
    );
    const inFlightPayment: OrderPayment = {
      id: "pay_in_flight",
      status: "authorized",
      amount: 10000,
      currency: "INR",
      method: "card",
      captured: false,
      createdAt: Math.floor(Date.now() / 1000),
    };
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([
      inFlightPayment,
    ]);

    const result = await useCase.execute({
      tenantId: "tenant_abc",
      razorpayOrderId: "order_rzp_999",
    });

    expect(result.status).toBe("INITIATED");
    expect(result.razorpayPaymentId).toBe("pay_in_flight");
    expect(mockRechargeRepo.markCancelled).not.toHaveBeenCalled();
  });

  it("marks as CANCELLED when no payment attempts exist on gateway", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue(
      mockRecharge,
    );
    vi.mocked(mockPayments.getOrderPayments).mockResolvedValue([]);
    vi.mocked(mockRechargeRepo.markCancelled).mockResolvedValue({
      ...mockRecharge,
      status: "CANCELLED",
      failureReason: "Checkout dismissed by user",
    });

    const result = await useCase.execute({
      tenantId: "tenant_abc",
      razorpayOrderId: "order_rzp_999",
      reason: "User closed modal",
    });

    expect(result.status).toBe("CANCELLED");
    expect(mockRechargeRepo.markCancelled).toHaveBeenCalledWith(
      "rec_123",
      "User closed modal",
    );
  });
});

