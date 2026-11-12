import { describe, it, expect, vi, beforeEach } from "vitest";
import { StopBatchesOnInsufficientBalanceUseCase } from "../application/use-cases/stop-batches-on-insufficient-balance.use-case";
import type { WalletRepository } from "../application/interfaces/wallet-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { IBolnaClientFactory } from "../../../shared/config/external/bolna/bolna-client.factory";
import prisma from "../../../shared/config/database/prisma";
import type { Logger } from "../../../shared/logging/logger.interface";
import { TenantHasNoApiKeyError } from "../../bolna-api-keys/domain/errors/bolna-api-key.errors";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    call: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    leadBatch: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    lead: {
      updateMany: vi.fn(),
    },
    campaign: {
      update: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => callback(prisma)),
  },
}));

describe("StopBatchesOnInsufficientBalanceUseCase (Multi-Provider & Sarvam)", () => {
  let useCase: StopBatchesOnInsufficientBalanceUseCase;
  let mockWalletRepo: WalletRepository;
  let mockPlanRepo: PlanRepository;
  let mockBolnaClientFactory: IBolnaClientFactory;
  let mockLogger: Logger;

  const tenantId = "tenant-sarvam-only-1";

  beforeEach(() => {
    vi.clearAllMocks();

    mockWalletRepo = {
      findByTenantId: vi.fn().mockResolvedValue({
        id: "wallet-1",
        tenantId,
        cashBalance: 0,
        bonusBalance: 0,
        bonusExpiresAt: null,
      }),
    } as unknown as WalletRepository;

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        lowBalanceThreshold: 100, // ₹1.00
        perMinuteRate: 150,
      }),
    } as unknown as PlanRepository;

    mockBolnaClientFactory = {
      forTenant: vi.fn().mockRejectedValue(new TenantHasNoApiKeyError(tenantId)),
      forApiKey: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    useCase = new StopBatchesOnInsufficientBalanceUseCase(
      mockWalletRepo,
      mockPlanRepo,
      mockBolnaClientFactory,
      mockLogger,
    );
  });

  it("stops Sarvam batches locally on low balance without invoking Bolna client or throwing", async () => {
    vi.mocked(prisma.call.count).mockResolvedValue(1); // 1 calling
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-sarvam-1",
          tenantId,
          campaignId: "campaign-1",
          status: "RUNNING",
          provider: "SARVAM",
          sarvamCohortId: "cohort-123",
          bolnaBatchId: null,
        } as any,
      ])
      .mockResolvedValueOnce([
        { status: "STOPPED" } as any, // all batches stopped check
      ]);

    vi.mocked(prisma.call.findMany).mockResolvedValue([
      { id: "call-1", leadId: "lead-1" } as any,
    ]);

    await useCase.execute({ tenantId });

    // Should NOT have attempted to call Bolna client factory because there were no Bolna batches
    expect(mockBolnaClientFactory.forTenant).not.toHaveBeenCalled();

    // Verify batch was updated to STOPPED
    expect(prisma.leadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-sarvam-1" },
      data: { status: "STOPPED" },
    });

    // Verify active call was transitioned to STOPPED
    expect(prisma.call.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["call-1"] } },
      data: expect.objectContaining({ status: "STOPPED" }),
    });

    // Verify uncalled and scheduled leads were transitioned to STOPPED with LOW_BALANCE
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ batchId: "batch-sarvam-1" }),
      data: { status: "STOPPED", stoppedReason: "LOW_BALANCE" },
    });

    // Verify campaign status updated to COMPLETED since all batches stopped
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
  });

  it("safely attempts Bolna client stop when a Bolna batch is present, without failing batch DB transactions if Bolna call fails", async () => {
    vi.mocked(prisma.call.count).mockResolvedValue(1);
    vi.mocked(prisma.leadBatch.findMany)
      .mockResolvedValueOnce([
        {
          id: "batch-bolna-1",
          tenantId,
          campaignId: "campaign-1",
          status: "RUNNING",
          provider: "BOLNA",
          bolnaBatchId: "bolna-batch-xyz",
          sarvamCohortId: null,
        } as any,
      ])
      .mockResolvedValueOnce([
        { status: "STOPPED" } as any,
      ]);

    vi.mocked(prisma.call.findMany).mockResolvedValue([]);

    await useCase.execute({ tenantId });

    // Bolna client was attempted
    expect(mockBolnaClientFactory.forTenant).toHaveBeenCalledWith(tenantId);
    // Even though Bolna client threw TenantHasNoApiKeyError, warning was logged and local DB batch update still completed
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not instantiate Bolna client"),
      expect.any(Object),
    );
    expect(prisma.leadBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-bolna-1" },
      data: { status: "STOPPED" },
    });
  });
});
