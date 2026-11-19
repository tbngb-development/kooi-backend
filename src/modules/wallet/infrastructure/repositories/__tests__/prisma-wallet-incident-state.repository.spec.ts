import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaWalletIncidentStateRepository } from "../prisma-wallet-incident-state.repository";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    walletIncidentState: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const tenantId = "tenant-1";
const idempotencyKey = `wallet-incident:${tenantId}`;

const openIncident = {
  id: "incident-1",
  tenantId,
  state: "OPEN",
  triggerBalancePaisa: -100,
  detectedAt: new Date("2026-01-01T00:00:00Z"),
  warningSentAt: null,
  enforcementSentAt: null,
  providerActions: [],
  idempotencyKey,
  resolvedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const resolvedIncident = {
  ...openIncident,
  state: "RESOLVED",
  resolvedAt: new Date("2026-01-02T00:00:00Z"),
};

const uniqueViolation = () => Object.assign(new Error("unique constraint"), { code: "P2002" });

describe("PrismaWalletIncidentStateRepository — atomic idempotent claim", () => {
  let repository: PrismaWalletIncidentStateRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaWalletIncidentStateRepository();
  });

  it("returns the single winner when two claims race on the unique key", async () => {
    vi.mocked(prisma.walletIncidentState.create)
      .mockResolvedValueOnce(openIncident as any)
      .mockRejectedValueOnce(uniqueViolation());
    vi.mocked(prisma.walletIncidentState.findUnique).mockResolvedValue(
      openIncident as any,
    );

    const [first, second] = await Promise.all([
      repository.claim({ tenantId, triggerBalancePaisa: -100 }),
      repository.claim({ tenantId, triggerBalancePaisa: -100 }),
    ]);

    expect(first.id).toBe(openIncident.id);
    expect(second.id).toBe(openIncident.id);
    expect(prisma.walletIncidentState.create).toHaveBeenCalledTimes(2);
    expect(prisma.walletIncidentState.findUnique).toHaveBeenCalledTimes(1);
  });

  it("does not create a second incident for a duplicate webhook while one is active", async () => {
    vi.mocked(prisma.walletIncidentState.create).mockRejectedValue(
      uniqueViolation(),
    );
    vi.mocked(prisma.walletIncidentState.findUnique).mockResolvedValue(
      openIncident as any,
    );

    const result = await repository.claim({
      tenantId,
      triggerBalancePaisa: -250,
    });

    expect(result).toMatchObject({
      id: openIncident.id,
      state: "OPEN",
      triggerBalancePaisa: -100,
    });
    expect(prisma.walletIncidentState.updateMany).not.toHaveBeenCalled();
  });

  it("reopens the same singleton record after a resolved incident instead of inserting another", async () => {
    const reopened = { ...openIncident, state: "OPEN", resolvedAt: null };
    vi.mocked(prisma.walletIncidentState.create).mockRejectedValue(
      uniqueViolation(),
    );
    vi.mocked(prisma.walletIncidentState.findUnique)
      .mockResolvedValueOnce(resolvedIncident as any)
      .mockResolvedValueOnce(reopened as any);
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 1,
    });

    const result = await repository.claim({
      tenantId,
      triggerBalancePaisa: -500,
    });

    expect(result.state).toBe("OPEN");
    const reopenCall = vi.mocked(prisma.walletIncidentState.updateMany).mock
      .calls[0][0];
    expect(reopenCall.where).toEqual({ id: openIncident.id, state: "RESOLVED" });
    expect(reopenCall.data).toMatchObject({
      state: "OPEN",
      triggerBalancePaisa: -500,
      resolvedAt: null,
      enforcementSentAt: null,
    });
    // Re-arming is owned by clearWarning; reopening an enforcement incident
    // must not silently clear warning state (that would re-notify on every
    // later positive-balance debit).
    expect(reopenCall.data).not.toHaveProperty("warningSentAt");
  });

  it("resolves an active incident without touching campaigns or batches", async () => {
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.walletIncidentState.findUnique).mockResolvedValue({
      ...openIncident,
      state: "RESOLVED",
      resolvedAt: new Date("2026-01-03T00:00:00Z"),
    } as any);

    const result = await repository.resolve(openIncident.id);

    expect(prisma.walletIncidentState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openIncident.id, state: { not: "RESOLVED" } },
        data: expect.objectContaining({ state: "RESOLVED" }),
      }),
    );
    expect(result.state).toBe("RESOLVED");
  });

  it("resolves a BLOCKED incident after recharge, clearing the enforcement lease", async () => {
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.walletIncidentState.findUnique).mockResolvedValue({
      ...openIncident,
      state: "RESOLVED",
      enforcementStartedAt: null,
      resolvedAt: new Date("2026-01-03T00:00:00Z"),
    } as any);

    const result = await repository.resolve(openIncident.id);

    expect(prisma.walletIncidentState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openIncident.id, state: { not: "RESOLVED" } },
        data: expect.objectContaining({
          state: "RESOLVED",
          enforcementStartedAt: null,
        }),
      }),
    );
    expect(result.state).toBe("RESOLVED");
    expect(result.enforcementStartedAt).toBeNull();
  });

  it("re-resolving an already RESOLVED incident is a no-op with no new status", async () => {
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.walletIncidentState.findUnique).mockResolvedValue(
      resolvedIncident as any,
    );

    const result = await repository.resolve(openIncident.id);

    expect(result.state).toBe("RESOLVED");
    const states = vi
      .mocked(prisma.walletIncidentState.updateMany)
      .mock.calls.flatMap((call) => {
        const data = call[0].data as { state?: string };
        return data.state ? [data.state] : [];
      });
    expect(new Set(states)).toEqual(new Set(["RESOLVED"]));
  });

  it("atomically begins enforcement only while the lease is free or expired", async () => {
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 1,
    });
    const now = new Date("2026-01-01T00:00:00Z");

    const won = await repository.beginEnforcement(openIncident.id, now, 60000);

    expect(won).toBe(true);
    expect(prisma.walletIncidentState.updateMany).toHaveBeenCalledWith({
      where: {
        id: openIncident.id,
        state: "OPEN",
        OR: [
          { enforcementStartedAt: null },
          { enforcementStartedAt: { lt: new Date(now.getTime() - 60000) } },
        ],
      },
      data: { enforcementStartedAt: now },
    });
  });

  it("returns false when another instance already holds the enforcement lease", async () => {
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 0,
    });

    expect(
      await repository.beginEnforcement(openIncident.id, new Date(), 60000),
    ).toBe(false);
  });

  it("marks BLOCKED with provider results and clears the lease", async () => {
    const results = [
      { target: { provider: "BOLNA", targetId: "b-1" }, success: true },
    ];
    vi.mocked(prisma.walletIncidentState.update).mockResolvedValue({
      ...openIncident,
      state: "BLOCKED",
    } as any);

    await repository.markBlocked(openIncident.id, results);

    expect(prisma.walletIncidentState.update).toHaveBeenCalledWith({
      where: { id: openIncident.id },
      data: {
        state: "BLOCKED",
        enforcementStartedAt: null,
        providerActions: results,
      },
    });
  });

  it("records provider failure, keeps incident OPEN, and clears the lease for retry", async () => {
    const results = [
      { target: { provider: "BOLNA", targetId: "b-1" }, success: false, error: "boom" },
    ];
    vi.mocked(prisma.walletIncidentState.update).mockResolvedValue({
      ...openIncident,
      state: "OPEN",
      providerActions: results,
    } as any);

    await repository.recordEnforcementFailure(openIncident.id, results);

    expect(prisma.walletIncidentState.update).toHaveBeenCalledWith({
      where: { id: openIncident.id },
      data: {
        state: "OPEN",
        enforcementStartedAt: null,
        providerActions: results,
      },
    });
  });

  it("claims the warning on a newly created singleton and returns the crossing time", async () => {
    const now = new Date("2026-03-01T00:00:00Z");
    vi.mocked(prisma.walletIncidentState.create).mockResolvedValue({
      ...openIncident,
      warningSentAt: now,
    } as any);

    const result = await repository.claimWarning(
      { tenantId, balancePaisa: 40000 },
      now,
    );

    expect(result).toBe(now);
    expect(prisma.walletIncidentState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        idempotencyKey,
        state: "OPEN",
        triggerBalancePaisa: 40000,
        warningSentAt: now,
      }),
    });
    expect(prisma.walletIncidentState.updateMany).not.toHaveBeenCalled();
  });

  it("atomically claims the warning once when the singleton already exists", async () => {
    const now = new Date("2026-03-01T00:00:00Z");
    vi.mocked(prisma.walletIncidentState.create).mockRejectedValue(
      uniqueViolation(),
    );
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 1,
    });

    const result = await repository.claimWarning(
      { tenantId, balancePaisa: 40000 },
      now,
    );

    expect(result).toBe(now);
    expect(prisma.walletIncidentState.updateMany).toHaveBeenCalledWith({
      where: { tenantId, warningSentAt: null },
      data: { warningSentAt: now },
    });
  });

  it("reuses the existing crossing time when a concurrent debit already claimed the warning", async () => {
    const attempted = new Date("2026-03-01T00:00:05Z");
    const winner = new Date("2026-03-01T00:00:00Z");
    vi.mocked(prisma.walletIncidentState.create).mockRejectedValue(
      uniqueViolation(),
    );
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.walletIncidentState.findUnique).mockResolvedValue({
      warningSentAt: winner,
    } as any);

    const result = await repository.claimWarning(
      { tenantId, balancePaisa: 40000 },
      attempted,
    );

    expect(result).toBe(winner);
  });

  it("re-arms the warning by clearing warningSentAt on recovery", async () => {
    vi.mocked(prisma.walletIncidentState.updateMany).mockResolvedValue({
      count: 1,
    });

    await repository.clearWarning(tenantId);

    expect(prisma.walletIncidentState.updateMany).toHaveBeenCalledWith({
      where: { tenantId, warningSentAt: { not: null } },
      data: { warningSentAt: null },
    });
  });

  it("finds stale OPEN incidents whose lease is missing or expired", async () => {
    vi.mocked(prisma.walletIncidentState.findMany).mockResolvedValue([
      openIncident as any,
    ]);
    const now = new Date("2026-01-01T00:00:00Z");

    const result = await repository.findStale(10, 60000, now);

    expect(result).toHaveLength(1);
    expect(prisma.walletIncidentState.findMany).toHaveBeenCalledWith({
      where: {
        state: "OPEN",
        OR: [
          { enforcementStartedAt: null },
          { enforcementStartedAt: { lt: new Date(now.getTime() - 60000) } },
        ],
      },
      orderBy: { detectedAt: "asc" },
      take: 10,
    });
  });
});
