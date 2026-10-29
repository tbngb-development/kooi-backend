import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessRazorpayWebhookUseCase } from "../application/use-cases/process-razorpay-webhook.use-case";
import { InvalidSignatureError } from "../domain/errors/payment.errors";
import type { RechargeRepository } from "../application/interfaces/recharge-repository.interface";
import type { IPaymentProvider } from "../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "../application/use-cases/complete-payment.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";
import type { Recharge } from "@prisma/client";

describe("ProcessRazorpayWebhookUseCase — Lifecycle & Webhook Events", () => {
  let mockRechargeRepo: RechargeRepository;
  let mockPayments: IPaymentProvider;
  let mockCompletePayment: CompletePaymentUseCase;
  let mockLogger: Logger;
  let useCase: ProcessRazorpayWebhookUseCase;

  const mockRecharge: Recharge = {
    id: "rec_wh_123",
    walletId: "wal_wh_123",
    tenantId: "tenant_wh",
    amount: 25000,
    currency: "INR",
    purpose: "WALLET_TOPUP",
    status: "INITIATED",
    provider: "razorpay",
    razorpayOrderId: "order_wh_123",
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
      verifyWebhookSignature: vi.fn().mockReturnValue(true),
      getOrderPayments: vi.fn(),
      capturePayment: vi.fn(),
    };

    mockCompletePayment = {
      execute: vi.fn(),
    } as unknown as CompletePaymentUseCase;

    useCase = new ProcessRazorpayWebhookUseCase(
      mockPayments,
      mockCompletePayment,
      mockLogger,
      mockRechargeRepo,
    );
  });

  it("throws InvalidSignatureError when HMAC signature check fails", async () => {
    vi.mocked(mockPayments.verifyWebhookSignature).mockReturnValue(false);

    await expect(
      useCase.execute({
        rawBody: JSON.stringify({ event: "payment.captured" }),
        signature: "invalid_sig",
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("handles payment.authorized by auto-capturing and calling completePayment", async () => {
    const payload = {
      event: "payment.authorized",
      payload: {
        payment: {
          entity: {
            id: "pay_auth_555",
            order_id: "order_wh_123",
            amount: 25000,
            currency: "INR",
            method: "card",
            status: "authorized",
          },
        },
      },
    };

    vi.mocked(mockPayments.capturePayment).mockResolvedValue({
      id: "pay_auth_555",
      status: "captured",
      amount: 25000,
      currency: "INR",
      method: "card",
      captured: true,
      createdAt: Math.floor(Date.now() / 1000),
    });

    const result = await useCase.execute({
      rawBody: JSON.stringify(payload),
      signature: "valid_sig_123",
    });

    expect(result.handled).toBe(true);
    expect(mockPayments.capturePayment).toHaveBeenCalledWith(
      "pay_auth_555",
      25000,
      "INR",
    );
    expect(mockCompletePayment.execute).toHaveBeenCalledWith({
      razorpayOrderId: "order_wh_123",
      razorpayPaymentId: "pay_auth_555",
      razorpaySignature: "webhook_autocapture:valid_sig_123",
    });
  });

  it("handles payment.failed by recording failureReason and transitioning dismissed/expired recharges to FAILED", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue({
      ...mockRecharge,
      status: "CANCELLED",
    });

    const payload = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_failed_444",
            order_id: "order_wh_123",
            error_description: "Bank declined the transaction",
          },
        },
      },
    };

    const result = await useCase.execute({
      rawBody: JSON.stringify(payload),
      signature: "valid_sig_fail",
    });

    expect(result.handled).toBe(true);
    expect(mockRechargeRepo.updateFailureReason).toHaveBeenCalledWith(
      "rec_wh_123",
      "Bank declined the transaction",
    );
    expect(mockRechargeRepo.markFailed).toHaveBeenCalledWith(
      "rec_wh_123",
      "Bank declined the transaction",
    );
  });

  it("handles late payment.captured webhook on a CANCELLED or EXPIRED recharge by completing as SUCCESS", async () => {
    vi.mocked(mockRechargeRepo.findByRazorpayOrderId).mockResolvedValue({
      ...mockRecharge,
      status: "CANCELLED", // previously cancelled by dismissal
    });

    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_late_capture_777",
            order_id: "order_wh_123",
            amount: 25000,
            currency: "INR",
            method: "upi",
            status: "captured",
          },
        },
      },
    };

    const result = await useCase.execute({
      rawBody: JSON.stringify(payload),
      signature: "valid_sig_late",
    });

    expect(result.handled).toBe(true);
    expect(mockCompletePayment.execute).toHaveBeenCalledWith({
      razorpayOrderId: "order_wh_123",
      razorpayPaymentId: "pay_late_capture_777",
      razorpaySignature: "webhook:valid_sig_late",
    });
  });
});

