import type { Recharge } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletRepository } from "../../wallet/application/interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { AutoAssignKeyUseCase } from "../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type { IEmailService } from "../../../shared/config/external/email/email.interface";
import type {
  IDiscordEventsPublisher,
  DiscordEvent,
} from "../../../shared/config/external/notifications/discordevents-publisher";
import type { Logger } from "../../../shared/logging/logger.interface";
import { CompletePaymentUseCase } from "../application/use-cases/complete-payment.use-case";
import type { RechargeRepository } from "../application/interfaces/recharge-repository.interface";
import type { TenantEmailRepository } from "../application/interfaces/tenant-email-repository.interface";

const baseRecharge: Recharge = {
  id: "rec_1",
  walletId: "wal_1",
  tenantId: "tenant-1",
  amount: 49900,
  currency: "INR",
  purpose: "WALLET_TOPUP",
  status: "INITIATED",
  provider: "razorpay",
  paymentMethod: null,
  razorpayOrderId: "order_ABC123",
  razorpayPaymentId: null,
  razorpaySignature: null,
  failureReason: null,
  tenantPlanId: null,
  targetPlanVersionId: null,
  createdAt: new Date("2026-11-17T09:00:00.000Z"),
  completedAt: null,
};

const completedRecharge: Recharge = {
  ...baseRecharge,
  status: "SUCCESS",
  razorpayPaymentId: "pay_XYZ789",
  completedAt: new Date("2026-11-17T10:00:00.000Z"),
};

describe("CompletePaymentUseCase — payment.completed notification", () => {
  let rechargeRepo: RechargeRepository;
  let walletRepo: WalletRepository;
  let planRepo: PlanRepository;
  let autoAssignKey: AutoAssignKeyUseCase;
  let email: IEmailService;
  let tenantEmailRepo: TenantEmailRepository;
  let publisher: IDiscordEventsPublisher;
  let logger: Logger;
  let useCase: CompletePaymentUseCase;

  const input = {
    razorpayOrderId: "order_ABC123",
    razorpayPaymentId: "pay_XYZ789",
    razorpaySignature: "sig_123",
    paymentMethod: "upi",
  };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    rechargeRepo = {
      findByRazorpayOrderId: vi.fn().mockResolvedValue(baseRecharge),
      markSuccess: vi.fn().mockResolvedValue(completedRecharge),
    } as unknown as RechargeRepository;

    walletRepo = {
      ensureWallet: vi.fn().mockResolvedValue(undefined),
      credit: vi.fn().mockResolvedValue(undefined),
    } as unknown as WalletRepository;

    planRepo = {} as unknown as PlanRepository;
    autoAssignKey = { execute: vi.fn() } as unknown as AutoAssignKeyUseCase;
    email = { send: vi.fn() } as unknown as IEmailService;

    tenantEmailRepo = {
      getEmailById: vi.fn().mockResolvedValue(null),
      getNameById: vi.fn().mockResolvedValue("Acme Motors"),
    } as unknown as TenantEmailRepository;

    publisher = { publish: vi.fn().mockResolvedValue(undefined) } as IDiscordEventsPublisher;

    useCase = new CompletePaymentUseCase(
      rechargeRepo,
      walletRepo,
      planRepo,
      autoAssignKey,
      email,
      tenantEmailRepo,
      logger,
      publisher,
    );
  });

  function publishedEvent(): DiscordEvent {
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    return vi.mocked(publisher.publish).mock.calls[0][0];
  }

  it("publishes a versioned payment.completed envelope on a fresh success", async () => {
    const result = await useCase.execute(input);

    expect(result.alreadyProcessed).toBe(false);
    expect(publishedEvent()).toMatchObject({
      eventId: "payment.completed:rec_1:success",
      eventType: "payment.completed",
      eventVersion: 1,
      occurredAt: "2026-11-17T10:00:00.000Z",
      tenantId: "tenant-1",
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId: "tenant-1",
        rechargeId: "rec_1",
        razorpayOrderId: "order_ABC123",
        razorpayPaymentId: "pay_XYZ789",
        amountPaisa: 49900,
        currency: "INR",
        purpose: "WALLET_TOPUP",
        paymentMethod: "upi",
        dashboardPath: "/billing",
      },
    });
  });

  it("does not publish on an idempotent hit", async () => {
    vi.mocked(rechargeRepo.findByRazorpayOrderId).mockResolvedValueOnce({
      ...baseRecharge,
      status: "SUCCESS",
    });

    await useCase.execute(input);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("does not publish when the concurrent-success guard loses the race", async () => {
    vi.mocked(rechargeRepo.markSuccess).mockResolvedValueOnce(null);

    await useCase.execute(input);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("falls back to tenantId when the tenant name is missing", async () => {
    vi.mocked(tenantEmailRepo.getNameById).mockResolvedValueOnce(null);

    await useCase.execute(input);

    expect(publishedEvent().data.tenantName).toBe("tenant-1");
  });

  it("never includes sensitive fields in the event data", async () => {
    await useCase.execute(input);

    const serialized = JSON.stringify(publishedEvent().data);
    expect(serialized).not.toMatch(/phone|transcript|recording|csv|secret|password|https?:\/\//i);
  });

  it("does not fail the payment when publishing throws", async () => {
    vi.mocked(publisher.publish).mockRejectedValueOnce(new Error("service down"));

    await expect(useCase.execute(input)).resolves.toMatchObject({
      alreadyProcessed: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      "failed to publish payment.completed event",
      expect.anything(),
      expect.objectContaining({
        action: "notification.publish_failed",
        rechargeId: "rec_1",
      }),
    );
  });
});
