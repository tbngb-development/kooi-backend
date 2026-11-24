import { describe, expect, it, vi } from "vitest";
import { CreateBatchUseCase } from "../application/use-cases/create-batch.use-case";
import { NoValidIndianPhonesError } from "../domain/errors/batch.errors";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";

vi.mock("../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

describe("CreateBatchUseCase contact validation", () => {
  it("rejects a file that only contains foreign contact numbers", async () => {
    const batchRepo = {
      create: vi.fn().mockResolvedValue({ id: "batch-1" }),
      findExistingPhones: vi.fn().mockResolvedValue([]),
      createLeads: vi.fn(),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
      update: vi.fn(),
    } as unknown as BatchRepository;

    const campaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: "camp-1",
        tenantId: "tenant-1",
        name: "Test Campaign",
        status: "ACTIVE",
        provider: "BOLNA",
        variables: {},
        assistant: {
          id: "assistant-1",
          platformAgent: { bolnaId: "bolna-agent-1" },
        },
      }),
    } as unknown as CampaignRepository;

    const planRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        status: "ACTIVE",
        isTrial: false,
        maxActiveCampaigns: 5,
        maxLeadsPerBatch: null,
        contactLimit: null,
        contactsUsed: 0,
        retryAutomation: false,
      }),
      countRunningCampaigns: vi.fn().mockResolvedValue(0),
      countConcurrentCampaignsAtTime: vi.fn().mockResolvedValue(0),
    } as unknown as PlanRepository;

    const storage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.example/raw.csv"),
    } as unknown as FileStorageProvider;

    const bolnaProvider = {
      createBatch: vi.fn().mockResolvedValue({ batch_id: "bolna-batch-1" }),
    } as unknown as BolnaBatchProvider;

    const useCase = new CreateBatchUseCase(
      batchRepo,
      campaignRepo,
      storage,
      bolnaProvider,
      planRepo,
    );

    await expect(
      useCase.execute({
        tenantId: "tenant-1",
        campaignId: "camp-1",
        fileName: "leads.csv",
        fileBuffer: Buffer.from(
          "Contact Number,Customer Name\n+6587792911,Foreign User",
          "utf-8",
        ),
        termsAccepted: true,
        termsVersion: "1.0",
      }),
    ).rejects.toThrow(NoValidIndianPhonesError);

    expect(batchRepo.create).not.toHaveBeenCalled();
    expect(bolnaProvider.createBatch).not.toHaveBeenCalled();
  });
});
