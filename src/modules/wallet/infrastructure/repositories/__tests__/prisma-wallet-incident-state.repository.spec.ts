import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaWalletIncidentStateRepository } from "../prisma-wallet-incident-state.repository";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    walletIncidentState: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
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
    expect(prisma.walletIncidentState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: openIncident.id, state: "RESOLVED" },
        data: expect.objectContaining({
          state: "OPEN",
          triggerBalancePaisa: -500,
          resolvedAt: null,
          warningSentAt: null,
          enforcementSentAt: null,
        }),
      }),
    );
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
});
