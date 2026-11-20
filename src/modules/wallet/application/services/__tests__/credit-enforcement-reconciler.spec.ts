import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreditEnforcementReconciler } from "../credit-enforcement-reconciler";
import type { CreditEnforcementOrchestrator } from "../../use-cases/credit-enforcement-orchestrator";
import type { WalletIncidentStateRepository } from "../../interfaces/wallet-incident-state-repository.interface";
import type { Logger } from "../../../../../shared/logging/logger.interface";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const stale = [
  { id: "i-1", tenantId: "tenant-1" },
  { id: "i-2", tenantId: "tenant-2" },
] as any[];

describe("CreditEnforcementReconciler — crash recovery for OPEN incidents", () => {
  let incidents: WalletIncidentStateRepository;
  let orchestrator: CreditEnforcementOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    incidents = {
      claim: vi.fn(),
      resolve: vi.fn(),
      beginEnforcement: vi.fn(),
      markBlocked: vi.fn(),
      recordEnforcementFailure: vi.fn(),
      findStale: vi.fn().mockResolvedValue(stale),
      findBlocked: vi.fn().mockResolvedValue([]),
    } as unknown as WalletIncidentStateRepository;
    orchestrator = {
      enforce: vi.fn().mockResolvedValue({ action: "BLOCKED" }),
    } as unknown as CreditEnforcementOrchestrator;
  });

  function makeReconciler() {
    return new CreditEnforcementReconciler({
      incidents,
      orchestrator,
      logger,
      enabled: true,
      pollMs: 1000,
      batchSize: 10,
      leaseMs: 60000,
    });
  }

  it("re-enforces every stale OPEN incident", async () => {
    const count = await makeReconciler().tick();

    expect(count).toBe(2);
    expect(orchestrator.enforce).toHaveBeenCalledTimes(2);
    expect(orchestrator.enforce).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      reason: "reconciler",
    });
  });

  it("passes the lease window to the stale query", async () => {
    const now = new Date("2026-01-01T00:00:00Z");

    await makeReconciler().tick(now);

    expect(incidents.findStale).toHaveBeenCalledWith(10, 60000, now);
  });

  it("does nothing when there are no stale incidents", async () => {
    vi.mocked(incidents.findStale).mockResolvedValue([]);

    expect(await makeReconciler().tick()).toBe(0);
    expect(orchestrator.enforce).not.toHaveBeenCalled();
  });

  it("re-checks BLOCKED incidents so a recharge can resolve them", async () => {
    const blocked = [{ id: "i-3", tenantId: "tenant-3" }] as any[];
    vi.mocked(incidents.findStale).mockResolvedValue([]);
    vi.mocked(incidents.findBlocked).mockResolvedValue(blocked);

    const count = await makeReconciler().tick();

    expect(count).toBe(1);
    expect(incidents.findBlocked).toHaveBeenCalledWith(10);
    expect(orchestrator.enforce).toHaveBeenCalledWith({
      tenantId: "tenant-3",
      reason: "reconciler",
    });
  });

  it("shares the batch budget between stale and blocked incidents", async () => {
    vi.mocked(incidents.findBlocked).mockResolvedValue([
      { id: "i-3", tenantId: "tenant-3" },
    ] as any[]);

    const count = await makeReconciler().tick();

    expect(incidents.findBlocked).toHaveBeenCalledWith(8);
    expect(count).toBe(3);
    expect(orchestrator.enforce).toHaveBeenCalledTimes(3);
  });

  it("does not re-enforce a tenant that appears in both scans", async () => {
    vi.mocked(incidents.findBlocked).mockResolvedValue([
      { id: "i-1", tenantId: "tenant-1" },
    ] as any[]);

    const count = await makeReconciler().tick();

    expect(count).toBe(2);
    expect(orchestrator.enforce).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(orchestrator.enforce).mock.calls.filter(
        ([input]) => input.tenantId === "tenant-1",
      ),
    ).toHaveLength(1);
  });

  it("skips the blocked query when the stale sweep already used the budget", async () => {
    vi.mocked(incidents.findStale).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `i-${i}`,
        tenantId: `tenant-${i}`,
      })) as any[],
    );

    await makeReconciler().tick();

    expect(incidents.findBlocked).not.toHaveBeenCalled();
  });

  it("never throws out of a tick when one incident fails", async () => {
    vi.mocked(orchestrator.enforce)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ action: "BLOCKED" } as any);

    await expect(makeReconciler().tick()).resolves.toBe(2);
  });
});
