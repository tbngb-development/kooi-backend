import { describe, expect, it, vi } from "vitest";
import { ParseLeadsUseCase } from "../application/use-cases/parse-leads.use-case";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../batches/application/interfaces/batch-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../wallet/application/interfaces/wallet-repository.interface";

describe("ParseLeadsUseCase", () => {
  it("reports a valid foreign contact number as non-importable", async () => {
    const campaignRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "camp-1",
        tenantId: "tenant-1",
      }),
    } as unknown as CampaignRepository;

    const batchRepo = {
      findExistingPhones: vi.fn().mockResolvedValue([]),
    } as unknown as BatchRepository;

    const planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        isTrial: false,
        perMinuteRate: 500,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
        maxLeadsPerBatch: null,
        contactLimit: null,
        contactsUsed: 0,
      }),
    } as unknown as PlanRepository;

    const walletRepo = {
      findByTenantId: vi.fn().mockResolvedValue({
        cashBalance: 0,
        bonusBalance: 0,
      }),
    } as unknown as WalletRepository;

    const useCase = new ParseLeadsUseCase(
      campaignRepo,
      batchRepo,
      planRepo,
      walletRepo,
    );

    const result = await useCase.execute({
      tenantId: "tenant-1",
      campaignId: "camp-1",
      fileName: "leads.csv",
      fileBuffer: Buffer.from(
        "Contact Number,Customer Name\n+6587792911,Foreign User",
        "utf-8",
      ),
    });

    expect(result).toMatchObject({
      total: 1,
      valid: 0,
      nonIndian: 1,
      nonIndianNumbers: ["+6587792911"],
      readyToImport: 0,
    });
  });
});
