import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import type { Logger } from "../../../../../shared/logging/logger.interface";
import type { IEmailOutboxRepository } from "../../../../../shared/config/external/email/outbox-repository.types";
import type {
  DiscordEvent,
  IDiscordEventsPublisher,
} from "../../../../../shared/config/external/notifications/discordevents-publisher";
import type { WalletRepository } from "../../interfaces/wallet-repository.interface";
import type { WalletIncidentStateRepository } from "../../interfaces/wallet-incident-state-repository.interface";
import type { PlanRepository } from "../../../../plans/application/interfaces/plan-repository.interface";
import { CheckLowBalanceUseCase } from "../check-low-balance.use-case";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    tenant: { findUnique: vi.fn() },
  },
}));

const tenantId = "tenant-1";
const crossingAt = new Date("2026-01-01T00:00:00.000Z");
const warningKey =
  `warn:${tenantId}:pv-1:3:50000:${crossingAt.toISOString()}`;

describe("CheckLowBalanceUseCase — durable positive-balance warning", () => {
  let walletRepo: WalletRepository;
  let planRepo: PlanRepository;
  let incidents: WalletIncidentStateRepository;
  let emailOutbox: IEmailOutboxRepository;
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
  const zeroWallet = {
    cashBalance: 0,
    bonusBalance: 0,
    bonusExpiresAt: null,
  };
  const negativeWallet = {
    cashBalance: -100,
    bonusBalance: 0,
    bonusExpiresAt: null,
  };

  const activePlan = {
    status: "ACTIVE",
    planVersionId: "pv-1",
    version: 3,
    creditLimit: 10000,
    warningThreshold: 50000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    walletRepo = {
      findByTenantId: vi.fn().mockResolvedValue(lowWallet),
    } as unknown as WalletRepository;
    planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue(activePlan),
    } as unknown as PlanRepository;
    incidents = {
      claimWarning: vi.fn().mockResolvedValue(crossingAt),
      clearWarning: vi.fn().mockResolvedValue(undefined),
    } as unknown as WalletIncidentStateRepository;
    emailOutbox = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    } as unknown as IEmailOutboxRepository;
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
      incidents,
      emailOutbox,
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

  function enqueuedEmail() {
    expect(emailOutbox.enqueue).toHaveBeenCalledTimes(1);
    return vi.mocked(emailOutbox.enqueue).mock.calls[0][0];
  }

  it("enqueues a durable warning email and publishes wallet.low_balance for a positive-balance crossing", async () => {
    await useCase.execute({ tenantId });

    expect(incidents.claimWarning).toHaveBeenCalledWith({
      tenantId,
      balancePaisa: 40000,
    });

    expect(enqueuedEmail()).toMatchObject({
      idempotencyKey: warningKey,
      to: "billing@acme.test",
      subject: "KOOI — Low Wallet Balance Alert",
    });

    expect(publishedEvent()).toMatchObject({
      eventId: warningKey,
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

  it("uses the active plan threshold and plan version in the idempotency key", async () => {
    vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
      status: "ACTIVE",
      planVersionId: "pv-9",
      version: 7,
      warningThreshold: 75000,
    } as any);

    await useCase.execute({ tenantId });

    expect(publishedEvent().eventId).toContain("warn:tenant-1:pv-9:7:75000:");
    expect(publishedEvent().data.thresholdPaisa).toBe(75000);
    expect(publishedEvent().data.balancePaisa).toBe(40000);
  });

  it("uses warningThreshold, never the credit limit, for the low-balance warning", async () => {
    // Balance 40,000 is above the credit limit (10,000) but below the warning
    // threshold (50,000): the warning must still fire.
    await useCase.execute({ tenantId });

    expect(emailOutbox.enqueue).toHaveBeenCalledTimes(1);
    expect(publishedEvent().data.thresholdPaisa).toBe(50000);
  });

  it("does not warn at zero or negative balance — enforcement owns that flow", async () => {
    vi.mocked(walletRepo.findByTenantId).mockResolvedValueOnce(zeroWallet as any);
    await useCase.execute({ tenantId });
    vi.mocked(walletRepo.findByTenantId).mockResolvedValueOnce(
      negativeWallet as any,
    );
    await useCase.execute({ tenantId });

    expect(incidents.claimWarning).not.toHaveBeenCalled();
    expect(emailOutbox.enqueue).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(incidents.clearWarning).not.toHaveBeenCalled();
  });

  it("converges duplicate debits in the same crossing on a single idempotency key", async () => {
    await useCase.execute({ tenantId });
    await useCase.execute({ tenantId });
    await useCase.execute({ tenantId });

    expect(incidents.claimWarning).toHaveBeenCalledTimes(3);
    const keys = vi
      .mocked(emailOutbox.enqueue)
      .mock.calls.map((call) => call[0].idempotencyKey);
    const eventIds = vi
      .mocked(publisher.publish)
      .mock.calls.map((call) => call[0].eventId);
    expect(new Set(keys).size).toBe(1);
    expect(new Set(eventIds).size).toBe(1);
    expect(keys[0]).toBe(warningKey);
  });

  it("re-arms after recovery and warns again on the next crossing", async () => {
    await useCase.execute({ tenantId });
    expect(publishedEvent().eventId).toBe(warningKey);

    vi.mocked(walletRepo.findByTenantId).mockResolvedValueOnce(highWallet as any);
    await useCase.execute({ tenantId });
    expect(incidents.clearWarning).toHaveBeenCalledWith(tenantId);
    expect(publisher.publish).toHaveBeenCalledTimes(1);

    const nextCrossing = new Date("2026-02-01T00:00:00.000Z");
    vi.mocked(incidents.claimWarning).mockResolvedValueOnce(nextCrossing);
    await useCase.execute({ tenantId });

    expect(publisher.publish).toHaveBeenCalledTimes(2);
    const secondEvent = vi.mocked(publisher.publish).mock.calls[1][0];
    expect(secondEvent.eventId).toBe(
      `warn:${tenantId}:pv-1:3:50000:${nextCrossing.toISOString()}`,
    );
    expect(secondEvent.eventId).not.toBe(warningKey);
  });

  it("does not fail the wallet check when the email enqueue rejects", async () => {
    vi.mocked(emailOutbox.enqueue).mockRejectedValueOnce(
      new Error("outbox unavailable"),
    );

    await expect(useCase.execute({ tenantId })).resolves.toBeUndefined();

    expect(emailOutbox.enqueue).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not fail the wallet check when notification publishing rejects", async () => {
    vi.mocked(publisher.publish).mockRejectedValueOnce(
      new Error("notification service down"),
    );

    await expect(useCase.execute({ tenantId })).resolves.toBeUndefined();

    expect(emailOutbox.enqueue).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it("does not fail when re-arming state fails during recovery", async () => {
    vi.mocked(walletRepo.findByTenantId).mockResolvedValue(highWallet as any);
    vi.mocked(incidents.clearWarning).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(useCase.execute({ tenantId })).resolves.toBeUndefined();

    expect(incidents.clearWarning).toHaveBeenCalledWith(tenantId);
    expect(logger.error).toHaveBeenCalled();
  });
});
