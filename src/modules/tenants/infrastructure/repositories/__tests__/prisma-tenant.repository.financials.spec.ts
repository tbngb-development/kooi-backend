import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../../../shared/config/database/prisma";
import { PrismaTenantRepository } from "../prisma-tenant.repository";

vi.mock("../../../../../shared/config/database/prisma", () => ({
  default: {
    tenant: { findUnique: vi.fn() },
    tenantUser: { count: vi.fn() },
    call: { count: vi.fn(), aggregate: vi.fn() },
    recharge: { count: vi.fn(), aggregate: vi.fn() },
    campaign: { count: vi.fn() },
    leadBatch: { count: vi.fn() },
    lead: { count: vi.fn() },
    assistant: { count: vi.fn() },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  },
}));

const mockedPrisma = prisma as any;

describe("PrismaTenantRepository financial aggregates", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedPrisma.tenant.findUnique.mockResolvedValue({
      wallet: {
        cashBalance: 450000,
        bonusBalance: 50000,
        bonusExpiresAt: null,
        currency: "INR",
      },
    });

    mockedPrisma.tenantUser.count.mockResolvedValue(3);

    mockedPrisma.call.count
      .mockResolvedValueOnce(1200) // total
      .mockResolvedValueOnce(980) // completed
      .mockResolvedValueOnce(5) // calling
      .mockResolvedValueOnce(15) // pending
      .mockResolvedValueOnce(100) // failed
      .mockResolvedValueOnce(50) // busy
      .mockResolvedValueOnce(50); // no answer

    mockedPrisma.call.aggregate.mockResolvedValue({
      _sum: {
        duration: 120000,
        billableSeconds: 135000,
        chargedAmount: 150000,
        platformCost: 90000,
        cost: 1234.56,
      },
    });

    mockedPrisma.recharge.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    mockedPrisma.recharge.aggregate.mockResolvedValue({
      _sum: { amount: 600000 },
    });

    mockedPrisma.campaign.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);

    mockedPrisma.leadBatch.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(1);

    mockedPrisma.lead.count
      .mockResolvedValueOnce(1500)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(980)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(2);

    mockedPrisma.assistant.count.mockResolvedValue(4);
  });

  it("exposes SUM(call.cost) as providerCostUsdCents alongside the existing platform cost", async () => {
    const result = await new PrismaTenantRepository().getStats("tenant-001");

    expect(result.stats.financials.providerCostUsdCents).toBe(1234.56);
    expect(result.stats.financials.platformCostPaisa).toBe(90000);
  });
});
