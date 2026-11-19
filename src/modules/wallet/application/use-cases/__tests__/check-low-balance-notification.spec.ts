import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import type { Logger } from "../../../../../shared/logging/logger.interface";
import type { IEmailService } from "../../../../../shared/config/external/email/email.interface";
import type {
  DiscordEvent,
  IDiscordEventsPublisher,
} from "../../../../../shared/config/external/notifications/discordevents-publisher";
import type { WalletRepository } from "../../interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../../../plans/application/interfaces/plan-repository.interface";
import { CheckLowBalanceUseCase } from "../check-low-balance.use-case";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    tenant: { findUnique: vi.fn() },
  },
}));

const tenantId = "tenant-1";

describe("CheckLowBalanceUseCase — wallet.low_balance notification", () => {
  let walletRepo: WalletRepository;
  let planRepo: PlanRepository;
  let email: IEmailService;
  let logger: Logger;
  let publisher: IDiscordEventsPublisher;
  let useCase: CheckLowBalanceUseCase;

  const lowWallet = {
    cashBalance: 40000,
    bonusBalance: 0,
    bonusExpiresAt: null,
  };
  const highWallet = {
    cashBalance: 60000,
    bonusBalance: 0,
    bonusExpiresAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    walletRepo = {
      findByTenantId: vi.fn().mockResolvedValue(lowWallet),
    } as unknown as WalletRepository;
    planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        warningThreshold: 50000,
      }),
    } as unknown as PlanRepository;
    email = { send: vi.fn().mockResolvedValue(undefined) };
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;
    publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    useCase = new CheckLowBalanceUseCase(
      walletRepo,
      planRepo,
      email,
      logger,
      publisher,
    );

    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      email: "billing@acme.test",
      name: "Acme Motors",
    } as any);
  });

  function publishedEvent(): DiscordEvent {
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    return vi.mocked(publisher.publish).mock.calls[0][0];
  }

  it("publishes wallet.low_balance on the low-balance crossing", async () => {
    await useCase.execute({ tenantId });

    expect(publishedEvent()).toMatchObject({
      eventId: "wallet.low_balance:tenant-1:crossed",
      eventType: "wallet.low_balance",
      eventVersion: 1,
      tenantId,
      source: "kooi-backend",
      data: {
        tenantName: "Acme Motors",
        tenantId,
        balancePaisa: 40000,
        thresholdPaisa: 50000,
        dashboardPath: "/billing",
      },
    });

    const serialized = JSON.stringify(publishedEvent().data);
    expect(serialized).not.toContain("billing@acme.test");
    expect(serialized).not.toMatch(/phone|transcript|recording/i);
  });

  it("uses the active plan threshold rather than a fixed default", async () => {
    vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
      status: "ACTIVE",
      warningThreshold: 75000,
    } as any);

    await useCase.execute({ tenantId });

    expect(publishedEvent().data.thresholdPaisa).toBe(75000);
    expect(publishedEvent().data.balancePaisa).toBe(40000);
  });

  it("uses warningThreshold, never the credit limit, for the low-balance warning", async () => {
    vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
      status: "ACTIVE",
      creditLimit: 10000,
      warningThreshold: 50000,
    } as any);

    await useCase.execute({ tenantId });

    // Balance 40,000 is above the credit limit (10,000) but below the
    // warning threshold (50,000): the warning must still fire.
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(publishedEvent().data.thresholdPaisa).toBe(50000);
  });

  it("does not publish again while the balance stays below the threshold", async () => {
    await useCase.execute({ tenantId });
    await useCase.execute({ tenantId });

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it("publishes again after the balance rises above the threshold", async () => {
    await useCase.execute({ tenantId });

    vi.mocked(walletRepo.findByTenantId).mockResolvedValueOnce(
      highWallet as any,
    );
    await useCase.execute({ tenantId });
    expect(publisher.publish).toHaveBeenCalledTimes(1);

    await useCase.execute({ tenantId });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it("does not fail the wallet check when notification publishing rejects", async () => {
    vi.mocked(publisher.publish).mockRejectedValueOnce(
      new Error("notification service down"),
    );

    await expect(useCase.execute({ tenantId })).resolves.toBeUndefined();

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
