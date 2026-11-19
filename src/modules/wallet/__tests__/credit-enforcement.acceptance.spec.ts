import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../shared/config/database/prisma";
import { DebitWalletForCallUseCase } from "../application/use-cases/debit-wallet.use-case";
import { CheckLowBalanceUseCase } from "../application/use-cases/check-low-balance.use-case";
import { CreditEnforcementOrchestrator } from "../application/use-cases/credit-enforcement-orchestrator";
import { computeBonusFirstDeduction } from "../domain/rules/bonus-first-deduction.rules";
import { hasExecutableBalance } from "../domain/rules/wallet-balance.policy";
import type { WalletRepository } from "../application/interfaces/wallet-repository.interface";
import type { WalletIncidentStateRepository } from "../application/interfaces/wallet-incident-state-repository.interface";
import type { ICampaignStopAdapter } from "../application/interfaces/campaign-stop-adapter.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type {
  EnqueueEmailInput,
  IEmailOutboxRepository,
} from "../../../shared/config/external/email/outbox-repository.types";
import type {
  DiscordEvent,
  IDiscordEventsPublisher,
} from "../../../shared/config/external/notifications/discordevents-publisher";
import type { Logger } from "../../../shared/logging/logger.interface";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: { tenant: { findUnique: vi.fn() } },
}));

const tenantId = "tenant-acceptance";
const incidentId = "incident-acceptance";
const warningThreshold = 50_000;
const creditLimit = 100_000;

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

/** Durable state shared by two separate application-instance object graphs. */
class SharedWalletStore {
  wallet = {
    id: "w-acceptance",
    tenantId,
    cashBalance: 0,
    bonusBalance: 0,
    bonusExpiresAt: null as Date | null,
    isActive: true,
    currency: "INR",
  };
  ledger: Array<Record<string, unknown>> = [];
  byKey = new Map<string, Record<string, unknown>>();
}

class SharedIncidentStore {
  state = {
    id: incidentId,
    tenantId,
    state: "OPEN",
    triggerBalancePaisa: 0,
    warningSentAt: null as Date | null,
    enforcementStartedAt: null as Date | null,
    resolvedAt: null as Date | null,
    providerActions: [] as unknown[],
  };
}

function makeWalletRepo(store: SharedWalletStore) {
  const debit = vi.fn(async (data: any) => {
    // The check is synchronous before any await, matching the row-locked
    // transaction's "one winner per idempotency key" guarantee.
    const existing = store.byKey.get(data.idempotencyKey);
    if (existing) return existing;

    const split = computeBonusFirstDeduction(store.wallet, data.amount);
    store.wallet.cashBalance = split.newCashBalance;
    store.wallet.bonusBalance = split.newBonusBalance;

    const tx = {
      id: `tx-${store.ledger.length + 1}`,
      ...data,
      cashDelta: split.cashDelta,
      bonusDelta: split.bonusDelta,
      cashBalanceAfter: split.newCashBalance,
      bonusBalanceAfter: split.newBonusBalance,
    };
    store.ledger.push(tx);
    store.byKey.set(data.idempotencyKey, tx);
    return tx;
  });

  return {
    findByTenantId: vi.fn(async () => ({ ...store.wallet })),
    ensureWallet: vi.fn(async () => ({ ...store.wallet })),
    debit,
  } as unknown as WalletRepository & { debit: typeof debit };
}

function makeIncidentRepo(store: SharedIncidentStore) {
  return {
    claim: vi.fn(async (input: { triggerBalancePaisa: number }) => {
      store.state.triggerBalancePaisa = input.triggerBalancePaisa;
      return { ...store.state };
    }),
    claimWarning: vi.fn(async (_input: unknown, now: Date = new Date()) => {
      if (!store.state.warningSentAt) store.state.warningSentAt = now;
      return store.state.warningSentAt as Date;
    }),
    clearWarning: vi.fn(async () => {
      store.state.warningSentAt = null;
    }),
    resolve: vi.fn(async () => {
      store.state.state = "RESOLVED";
      store.state.resolvedAt = new Date();
      store.state.enforcementStartedAt = null;
      return { ...store.state };
    }),
    beginEnforcement: vi.fn(async () => {
      if (store.state.enforcementStartedAt) return false;
      store.state.enforcementStartedAt = new Date();
      return true;
    }),
    markBlocked: vi.fn(async (_id: string, actions: unknown[]) => {
      store.state.state = "BLOCKED";
      store.state.providerActions = actions;
      store.state.enforcementStartedAt = null;
      return { ...store.state };
    }),
    recordEnforcementFailure: vi.fn(async (_id: string, actions: unknown[]) => {
      store.state.state = "OPEN";
      store.state.providerActions = actions;
      store.state.enforcementStartedAt = null;
      return { ...store.state };
    }),
    findStale: vi.fn(async () => []),
  } as unknown as WalletIncidentStateRepository;
}

function makePlanRepo() {
  return {
    getActivePlanForTenant: vi.fn(async () => ({
      status: "ACTIVE",
      planVersionId: "pv-1",
      version: 1,
      perMinuteRate: 2_000,
      billingMinimumSec: 30,
      billingIncrementSec: 15,
      creditLimit,
      warningThreshold,
    })),
  } as unknown as PlanRepository;
}

function makeOutbox() {
  const envelopes: EnqueueEmailInput[] = [];
  return {
    envelopes,
    enqueue: vi.fn(async (envelope: EnqueueEmailInput) => {
      if (!envelopes.some((e) => e.idempotencyKey === envelope.idempotencyKey)) {
        envelopes.push(envelope);
      }
      return envelope;
    }),
  } as unknown as IEmailOutboxRepository & {
    envelopes: EnqueueEmailInput[];
    enqueue: ReturnType<typeof vi.fn>;
  };
}

function makePublisher() {
  const events: DiscordEvent[] = [];
  return {
    events,
    publish: vi.fn(async (event: DiscordEvent) => {
      events.push(event);
    }),
  } as unknown as IDiscordEventsPublisher & {
    events: DiscordEvent[];
    publish: ReturnType<typeof vi.fn>;
  };
}

function makeStopAdapter() {
  return {
    stop: vi.fn(async () => [
      {
        target: { provider: "BOLNA", kind: "BATCH", targetId: "batch-1" },
        success: true,
        error: null,
      },
    ]),
    // Not part of ICampaignStopAdapter on purpose: a spy that would fail loudly
    // if any code path ever tried to resume work after enforcement.
    resume: vi.fn(async () => {
      throw new Error("resume must never be called");
    }),
  } as unknown as ICampaignStopAdapter & {
    stop: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };
}

interface SharedDurableState {
  walletStore: SharedWalletStore;
  incidentStore: SharedIncidentStore;
  outbox: ReturnType<typeof makeOutbox>;
  publisher: ReturnType<typeof makePublisher>;
  stop: ReturnType<typeof makeStopAdapter>;
}

function makeHarness(shared: SharedDurableState = {
  walletStore: new SharedWalletStore(),
  incidentStore: new SharedIncidentStore(),
  outbox: makeOutbox(),
  publisher: makePublisher(),
  stop: makeStopAdapter(),
}) {
  const incidents = makeIncidentRepo(shared.incidentStore);
  const wallets = makeWalletRepo(shared.walletStore);
  const planRepo = makePlanRepo();

  const warning = new CheckLowBalanceUseCase(
    wallets,
    planRepo,
    incidents,
    shared.outbox,
    logger,
    shared.publisher,
  );
  const enforcement = new CreditEnforcementOrchestrator({
    incidents,
    wallets,
    providers: shared.stop,
    emailOutbox: shared.outbox,
    tenantEmail: vi.fn(async () => "owner@example.test"),
    adminEmails: vi.fn(async () => ["admin@example.test"]),
    logger,
  });
  const debit = new DebitWalletForCallUseCase(
    wallets,
    planRepo,
    warning,
    enforcement,
    logger,
  );

  return { ...shared, incidents, wallets, warning, enforcement, debit };
}

const callInput = { tenantId, callId: "call-acceptance", durationSec: 60 };

describe("credit enforcement acceptance — warning and enforcement are independent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      email: "billing@example.test",
      name: "Acceptance Tenant",
    } as any);
  });

  it("settles a dispatched call below zero: warning stays silent, enforcement blocks once", async () => {
    const h = makeHarness();
    h.walletStore.wallet.cashBalance = 1_000; // one 60s call costs 2,000 paise

    const result = await h.debit.execute(callInput);

    // D-03: already-dispatched calls settle into negative balance.
    expect(result?.amountPaisa).toBe(2_000);
    expect(h.walletStore.ledger).toHaveLength(1);
    expect(h.walletStore.wallet.cashBalance).toBe(-1_000);
    expect(vi.mocked(h.wallets.debit)).toHaveBeenCalledWith(
      expect.objectContaining({ allowOverdraft: true, sourceType: "CALL" }),
    );

    // D-01: the positive-balance warning never fires at zero/negative.
    expect(vi.mocked(h.incidents.claimWarning)).not.toHaveBeenCalled();
    expect(
      h.outbox.envelopes.filter((e) => e.idempotencyKey.startsWith("warn:")),
    ).toHaveLength(0);
    expect(h.publisher.events).toHaveLength(0);

    // D-01/D-07: one durable tenant-wide block with stable email keys.
    expect(h.stop.stop).toHaveBeenCalledTimes(1);
    expect(h.stop.stop).toHaveBeenCalledWith(tenantId);
    expect(h.incidentStore.state.state).toBe("BLOCKED");
    expect(h.outbox.envelopes.map((e) => e.idempotencyKey)).toEqual([
      `enforce:${incidentId}`,
      `enforce:${incidentId}:admin:admin@example.test`,
    ]);
    expect(h.stop.resume).not.toHaveBeenCalled();
  });

  it("warns at a positive low balance but never stops campaigns or batches", async () => {
    const h = makeHarness();
    h.walletStore.wallet.cashBalance = 40_000; // below the 50,000 warning threshold

    await h.debit.execute(callInput);

    expect(h.walletStore.wallet.cashBalance).toBe(38_000);

    // D-01/D-05: warning fires with one crossing-stable key and one event.
    expect(vi.mocked(h.incidents.claimWarning)).toHaveBeenCalledTimes(1);
    const warnings = h.outbox.envelopes.filter((e) =>
      e.idempotencyKey.startsWith("warn:"),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].idempotencyKey).toMatch(
      /^warn:tenant-acceptance:pv-1:1:50000:/,
    );
    expect(h.publisher.events).toHaveLength(1);
    expect(h.publisher.events[0]).toMatchObject({
      eventType: "wallet.low_balance",
      eventId: warnings[0].idempotencyKey,
    });

    // The warning path does not stop anything; enforcement resolves instead.
    expect(h.stop.stop).not.toHaveBeenCalled();
    expect(vi.mocked(h.incidents.markBlocked)).not.toHaveBeenCalled();
    expect(h.incidentStore.state.state).toBe("RESOLVED");
    expect(
      h.outbox.envelopes.some((e) => e.idempotencyKey.startsWith("enforce:")),
    ).toBe(false);
    expect(h.stop.resume).not.toHaveBeenCalled();
  });

  it("two app instances with a duplicate debit converge on one debit and one warning", async () => {
    const shared: SharedDurableState = {
      walletStore: new SharedWalletStore(),
      incidentStore: new SharedIncidentStore(),
      outbox: makeOutbox(),
      publisher: makePublisher(),
      stop: makeStopAdapter(),
    };
    shared.walletStore.wallet.cashBalance = 40_000;
    const instanceA = makeHarness(shared);
    const instanceB = makeHarness(shared);

    await Promise.all([
      instanceA.debit.execute(callInput),
      instanceB.debit.execute(callInput),
    ]);

    // D-07: one ledger entry, one charge, one crossing notification.
    expect(shared.walletStore.ledger).toHaveLength(1);
    expect(shared.walletStore.wallet.cashBalance).toBe(38_000);
    const warningKeys = shared.outbox.envelopes
      .filter((e) => e.idempotencyKey.startsWith("warn:"))
      .map((e) => e.idempotencyKey);
    expect(warningKeys).toHaveLength(1);
    expect(new Set(shared.publisher.events.map((e) => e.eventId)).size).toBe(1);
    expect(shared.incidentStore.state.state).toBe("RESOLVED");
    expect(shared.stop.stop).not.toHaveBeenCalled();
  });

  it("two app instances with a duplicate webhook settle once and enforce once", async () => {
    const shared: SharedDurableState = {
      walletStore: new SharedWalletStore(),
      incidentStore: new SharedIncidentStore(),
      outbox: makeOutbox(),
      publisher: makePublisher(),
      stop: makeStopAdapter(),
    };
    shared.walletStore.wallet.cashBalance = 1_000;
    const instanceA = makeHarness(shared);
    const instanceB = makeHarness(shared);

    await Promise.all([
      instanceA.debit.execute(callInput),
      instanceB.debit.execute(callInput),
    ]);

    expect(shared.walletStore.ledger).toHaveLength(1);
    expect(shared.walletStore.wallet.cashBalance).toBe(-1_000);
    expect(vi.mocked(instanceA.incidents.claimWarning)).not.toHaveBeenCalled();
    expect(vi.mocked(instanceB.incidents.claimWarning)).not.toHaveBeenCalled();
    expect(shared.stop.stop).toHaveBeenCalledTimes(1);
    expect(new Set(shared.outbox.envelopes.map((e) => e.idempotencyKey)).size).toBe(
      shared.outbox.envelopes.length,
    );
    expect(shared.incidentStore.state.state).toBe("BLOCKED");
  });

  it("a recharge after a block never resumes stopped campaigns or batches", async () => {
    const h = makeHarness();
    h.walletStore.wallet.cashBalance = 1_000;
    await h.debit.execute(callInput);
    expect(h.incidentStore.state.state).toBe("BLOCKED");
    expect(h.stop.stop).toHaveBeenCalledTimes(1);

    const stoppedWork = { batch: "STOPPED", campaign: "COMPLETED" };

    // Tenant tops up; the next balance check must not restart anything.
    h.walletStore.wallet.cashBalance = 200_000;
    const result = await h.enforcement.enforce({ tenantId, reason: "recharge" });

    expect(result.action).toBe("ALREADY_BLOCKED");
    expect(h.stop.stop).toHaveBeenCalledTimes(1);
    expect(h.stop.resume).not.toHaveBeenCalled();
    expect(stoppedWork).toEqual({ batch: "STOPPED", campaign: "COMPLETED" });
    expect(
      h.outbox.envelopes.filter((e) => e.idempotencyKey.startsWith("enforce:")),
    ).toHaveLength(2);
  });

  it("an OPEN incident with recovered balance resolves without touching stopped work", async () => {
    const h = makeHarness();
    h.walletStore.wallet.cashBalance = 200_000;
    const stoppedWork = { batch: "STOPPED", campaign: "COMPLETED" };

    const result = await h.enforcement.enforce({ tenantId, reason: "recharge" });

    expect(result.action).toBe("RESOLVED");
    expect(vi.mocked(h.incidents.resolve)).toHaveBeenCalledTimes(1);
    expect(h.stop.stop).not.toHaveBeenCalled();
    expect(h.stop.resume).not.toHaveBeenCalled();
    expect(stoppedWork).toEqual({ batch: "STOPPED", campaign: "COMPLETED" });
  });
});

describe("hasExecutableBalance — the single zero-balance gate", () => {
  const wallet = (cashBalance: number, bonusBalance = 0) => ({
    cashBalance,
    bonusBalance,
    bonusExpiresAt: null as Date | null,
  });

  it.each([0, -1, -50_000])("blocks execution at balance %i", (balance) => {
    expect(hasExecutableBalance(wallet(balance))).toBe(false);
  });

  it("cannot be overridden by credit limit (it is not an input)", () => {
    expect(hasExecutableBalance(wallet(0))).toBe(false);
    expect(creditLimit).toBeGreaterThan(0);
  });

  it("ignores expired bonus credit", () => {
    expect(
      hasExecutableBalance({
        cashBalance: 0,
        bonusBalance: 10_000,
        bonusExpiresAt: new Date("2000-01-01T00:00:00Z"),
      }),
    ).toBe(false);
  });

  it("allows execution only with real, currently usable funds", () => {
    expect(hasExecutableBalance(wallet(1))).toBe(true);
  });
});
