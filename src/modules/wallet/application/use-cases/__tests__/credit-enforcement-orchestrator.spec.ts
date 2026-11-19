import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreditEnforcementOrchestrator } from "../credit-enforcement-orchestrator";
import type { WalletIncidentStateRepository } from "../../interfaces/wallet-incident-state-repository.interface";
import type { ICampaignStopAdapter, ProviderStopResult } from "../../interfaces/campaign-stop-adapter.interface";
import type { WalletRepository } from "../../interfaces/wallet-repository.interface";
import type { IEmailOutboxRepository } from "../../../../../shared/config/external/email/outbox-repository.types";
import type { Logger } from "../../../../../shared/logging/logger.interface";

const tenantId = "tenant-1";
const incidentId = "incident-1";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const openIncident = {
  id: incidentId,
  tenantId,
  state: "OPEN",
  triggerBalancePaisa: -100,
  enforcementStartedAt: null,
  providerActions: [],
} as any;

const blockedIncident = {
  ...openIncident,
  state: "BLOCKED",
  providerActions: [{ target: { provider: "BOLNA", targetId: "b-1" }, success: true }],
} as any;

const zeroWallet = {
  id: "w-1",
  tenantId,
  cashBalance: 0,
  bonusBalance: 0,
  bonusExpiresAt: null,
} as any;

const positiveWallet = { ...zeroWallet, cashBalance: 50000 } as any;

const okResult: ProviderStopResult = {
  target: { provider: "BOLNA", kind: "BATCH", targetId: "batch-1" },
  success: true,
  error: null,
};

function makeIncidents(overrides: Partial<WalletIncidentStateRepository> = {}) {
  return {
    claim: vi.fn().mockResolvedValue(openIncident),
    resolve: vi.fn().mockResolvedValue(openIncident),
    beginEnforcement: vi.fn().mockResolvedValue(true),
    markBlocked: vi.fn().mockResolvedValue(undefined),
    recordEnforcementFailure: vi.fn().mockResolvedValue(openIncident),
    findStale: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as WalletIncidentStateRepository;
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    incidents: makeIncidents(),
    wallets: {
      findByTenantId: vi.fn().mockResolvedValue(zeroWallet),
    } as unknown as WalletRepository,
    providers: {
      stop: vi.fn().mockResolvedValue([okResult]),
    } as unknown as ICampaignStopAdapter,
    emailOutbox: {
      enqueue: vi.fn().mockResolvedValue(openIncident),
    } as unknown as IEmailOutboxRepository,
    tenantEmail: vi.fn().mockResolvedValue("owner@example.com"),
    adminEmails: vi.fn().mockResolvedValue(["admin@example.com"]),
    logger,
    ...overrides,
  };
}

describe("CreditEnforcementOrchestrator — U-04 single awaited path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops providers, persists results, enqueues email, then marks BLOCKED", async () => {
    const deps = makeDeps();
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("BLOCKED");
    expect(deps.providers.stop).toHaveBeenCalledWith(tenantId);
    expect(deps.incidents.markBlocked).toHaveBeenCalledWith(
      incidentId,
      expect.arrayContaining([expect.objectContaining({ success: true })]),
    );
    expect(deps.emailOutbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `enforce:${incidentId}` }),
    );
  });

  it("does not stop providers when balance is positive; resolves the incident instead", async () => {
    const deps = makeDeps({
      wallets: { findByTenantId: vi.fn().mockResolvedValue(positiveWallet) },
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("RESOLVED");
    expect(deps.incidents.resolve).toHaveBeenCalledWith(incidentId);
    expect(deps.providers.stop).not.toHaveBeenCalled();
    expect(deps.incidents.markBlocked).not.toHaveBeenCalled();
  });

  it("is idempotent — an already BLOCKED incident makes no provider calls", async () => {
    const deps = makeDeps({
      incidents: makeIncidents({
        claim: vi.fn().mockResolvedValue(blockedIncident),
      }),
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("ALREADY_BLOCKED");
    expect(deps.providers.stop).not.toHaveBeenCalled();
    expect(deps.emailOutbox.enqueue).not.toHaveBeenCalled();
  });

  it("only one of two concurrent enforcements wins the lease", async () => {
    const incidents = makeIncidents({
      claim: vi.fn().mockResolvedValue(openIncident),
      beginEnforcement: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    });
    const deps = makeDeps({ incidents });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const results = await Promise.all([
      orchestrator.enforce({ tenantId }),
      orchestrator.enforce({ tenantId }),
    ]);

    expect(results.map((r) => r.action).sort()).toEqual([
      "BLOCKED",
      "IN_PROGRESS",
    ]);
    expect(deps.providers.stop).toHaveBeenCalledTimes(1);
  });

  it("records provider failure honestly, keeps local block, and queues retry", async () => {
    const failed: ProviderStopResult = {
      target: { provider: "SARVAM", kind: "CAMPAIGN", targetId: "camp-1" },
      success: false,
      error: "provider 500",
    };
    const deps = makeDeps({
      providers: { stop: vi.fn().mockResolvedValue([failed]) },
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("RETRY_QUEUED");
    expect(deps.incidents.recordEnforcementFailure).toHaveBeenCalledWith(
      incidentId,
      expect.arrayContaining([
        expect.objectContaining({ success: false, error: "provider 500" }),
      ]),
    );
    expect(deps.incidents.markBlocked).not.toHaveBeenCalled();
  });

  it("still blocks when the email enqueue throws", async () => {
    const deps = makeDeps({
      emailOutbox: { enqueue: vi.fn().mockRejectedValue(new Error("db down")) },
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("BLOCKED");
    expect(deps.incidents.markBlocked).toHaveBeenCalled();
  });

  it("does not throw when the provider adapter throws; records failure and queues retry", async () => {
    const deps = makeDeps({
      providers: { stop: vi.fn().mockRejectedValue(new Error("adapter down")) },
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("RETRY_QUEUED");
    expect(deps.incidents.recordEnforcementFailure).toHaveBeenCalledWith(
      incidentId,
      expect.arrayContaining([
        expect.objectContaining({ success: false, error: "adapter down" }),
      ]),
    );
    expect(deps.incidents.markBlocked).not.toHaveBeenCalled();
  });

  it("enqueues a distinct internal admin copy alongside the tenant notice", async () => {
    const deps = makeDeps({
      adminEmails: vi
        .fn()
        .mockResolvedValue(["admin1@example.com", "admin2@example.com"]),
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    await orchestrator.enforce({ tenantId, reason: "zero balance" });

    const calls = vi.mocked(deps.emailOutbox.enqueue).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.idempotencyKey)).toEqual([
      "enforce:incident-1",
      "enforce:incident-1:admin:admin1@example.com",
      "enforce:incident-1:admin:admin2@example.com",
    ]);
    expect(calls[0].to).toBe("owner@example.com");
    expect(calls[0].subject).toContain("wallet");
    expect(calls[1].to).toBe("admin1@example.com");
    expect(calls[1].subject).toContain("internal");
    expect(calls[1].html).toContain("incident-1");
    expect(calls[1].html).toContain("Internal operational notification");
    expect(calls[1].html).toContain("zero balance");
  });

  it("does not enqueue any email when neither tenant nor admins have an address", async () => {
    const deps = makeDeps({
      tenantEmail: vi.fn().mockResolvedValue(null),
      adminEmails: vi.fn().mockResolvedValue([]),
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("BLOCKED");
    expect(deps.emailOutbox.enqueue).not.toHaveBeenCalled();
  });

  it("isolates each email enqueue failure and still blocks", async () => {
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce(openIncident)
      .mockRejectedValueOnce(new Error("admin1 down"))
      .mockResolvedValueOnce(openIncident);
    const deps = makeDeps({
      adminEmails: vi
        .fn()
        .mockResolvedValue(["admin1@example.com", "admin2@example.com"]),
      emailOutbox: { enqueue } as unknown as IEmailOutboxRepository,
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("BLOCKED");
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      "Enforcement email enqueue failed",
      expect.any(Error),
      expect.objectContaining({
        idempotencyKey: "enforce:incident-1:admin:admin1@example.com",
      }),
    );
  });

  it("does not block enforcement when recipient lookup fails", async () => {
    const deps = makeDeps({
      tenantEmail: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const orchestrator = new CreditEnforcementOrchestrator(deps);

    const result = await orchestrator.enforce({ tenantId });

    expect(result.action).toBe("BLOCKED");
    expect(deps.emailOutbox.enqueue).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Enforcement email recipient lookup failed",
      expect.any(Error),
      expect.anything(),
    );
  });
});
