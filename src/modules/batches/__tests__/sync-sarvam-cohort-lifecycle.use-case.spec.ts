import { describe, it, expect, vi, beforeEach } from "vitest";
// modules/batches/__tests__/sync-sarvam-cohort-lifecycle.use-case.spec.ts

import { SyncSarvamCohortLifecycleUseCase } from "../application/use-cases/sync-sarvam-cohort-lifecycle.use-case";
import type { BatchRepository, ProcessingSarvamBatchRecord } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { ISarvamCohortClient } from "../application/interfaces/sarvam-cohort-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";

describe("SyncSarvamCohortLifecycleUseCase", () => {
  let useCase: SyncSarvamCohortLifecycleUseCase;
  let mockBatchRepo: any;
  let mockCampaignRepo: any;
  let mockCohortClient: any;
  let mockEncryptionService: any;

  beforeEach(() => {
    mockBatchRepo = {
      findProcessingSarvamBatches: vi.fn(),
      updateSarvamCohortStatus: vi.fn(),
    };

    mockCampaignRepo = {
      findById: vi.fn(),
      findSarvamAgentWithApiKey: vi.fn(),
    };

    mockCohortClient = {
      getCohort: vi.fn(),
    };

    mockEncryptionService = {
      encrypt: vi.fn(),
      decrypt: vi.fn().mockReturnValue("decrypted-api-key"),
    };

    useCase = new SyncSarvamCohortLifecycleUseCase(
      mockBatchRepo as unknown as BatchRepository,
      mockCampaignRepo as unknown as CampaignRepository,
      mockCohortClient as unknown as ISarvamCohortClient,
      mockEncryptionService,
    );
  });

  it("returns zero counts when no processing batches found", async () => {
    mockBatchRepo.findProcessingSarvamBatches!.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({ syncedCount: 0, updatedCount: 0, errors: [] });
    expect(mockCohortClient.getCohort).not.toHaveBeenCalled();
  });

  it("skips batch if campaign metadata or agent is missing", async () => {
    const batchRecord: ProcessingSarvamBatchRecord = {
      id: "batch-1",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      sarvamCohortId: "coh-1",
      status: "PROCESSING",
      sarvamStatus: "processing",
    };

    mockBatchRepo.findProcessingSarvamBatches!.mockResolvedValue([batchRecord]);
    mockCampaignRepo.findById!.mockResolvedValue(null);

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(mockCohortClient.getCohort).not.toHaveBeenCalled();
  });

  it("updates batch when cohort completes with record counts", async () => {
    const batchRecord: ProcessingSarvamBatchRecord = {
      id: "batch-1",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      sarvamCohortId: "coh-1",
      status: "PROCESSING",
      sarvamStatus: "processing",
    };

    mockBatchRepo.findProcessingSarvamBatches!.mockResolvedValue([batchRecord]);
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      provider: "SARVAM",
    } as any);

    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      apiKey: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockCohortClient.getCohort!.mockResolvedValue({
      cohort_id: "coh-1",
      name: "April Batch",
      status: "completed",
      source_type: "file_upload",
      cohort_category: "cohort",
      created_by: "user@test.com",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: {
        total_records: 100,
        valid_records: 98,
        rejected_records: 2,
      },
    });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(mockBatchRepo.updateSarvamCohortStatus).toHaveBeenCalledWith(
      "batch-1",
      "completed",
      "CREATED",
      {
        total_records: 100,
        valid_records: 98,
        rejected_records: 2,
      },
      null,
    );
  });

  it("updates batch to FAILED when remote cohort status is failed", async () => {
    const batchRecord: ProcessingSarvamBatchRecord = {
      id: "batch-1",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      sarvamCohortId: "coh-1",
      status: "PROCESSING",
      sarvamStatus: "processing",
    };

    mockBatchRepo.findProcessingSarvamBatches!.mockResolvedValue([batchRecord]);
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      provider: "SARVAM",
    } as any);

    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      apiKey: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockCohortClient.getCohort!.mockResolvedValue({
      cohort_id: "coh-1",
      name: "April Batch",
      status: "failed",
      source_type: "file_upload",
      cohort_category: "cohort",
      created_by: "user@test.com",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: null,
    });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(mockBatchRepo.updateSarvamCohortStatus).toHaveBeenCalledWith(
      "batch-1",
      "failed",
      "FAILED",
      null,
      "Sarvam cohort processing failed at voice provider.",
    );
  });

  it("handles errors gracefully without crashing the whole process", async () => {
    const batch1: ProcessingSarvamBatchRecord = {
      id: "batch-1",
      tenantId: "tenant-1",
      campaignId: "camp-1",
      sarvamCohortId: "coh-1",
      status: "PROCESSING",
      sarvamStatus: "processing",
    };
    const batch2: ProcessingSarvamBatchRecord = {
      id: "batch-2",
      tenantId: "tenant-1",
      campaignId: "camp-2",
      sarvamCohortId: "coh-2",
      status: "PROCESSING",
      sarvamStatus: "processing",
    };

    mockBatchRepo.findProcessingSarvamBatches!.mockResolvedValue([batch1, batch2]);
    mockCampaignRepo.findById!.mockResolvedValue({
      id: "camp-1",
      tenantId: "tenant-1",
      sarvamCampaignId: "srv-camp-1",
      sarvamAgentId: "agent-1",
      provider: "SARVAM",
    } as any);

    mockCampaignRepo.findSarvamAgentWithApiKey!.mockResolvedValue({
      id: "agent-1",
      apiKey: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        apiKeyEncrypted: "encrypted-key",
      },
    } as any);

    mockCohortClient.getCohort!
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce({
        cohort_id: "coh-2",
        name: "Batch 2",
        status: "completed",
        source_type: "file_upload",
        cohort_category: "cohort",
        created_by: "user@test.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result: {
          total_records: 50,
          valid_records: 50,
          rejected_records: 0,
        },
      });

    const result = await useCase.execute();

    expect(result.syncedCount).toBe(2);
    expect(result.updatedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ batchId: "batch-1", error: "Timeout" });
    expect(mockBatchRepo.updateSarvamCohortStatus).toHaveBeenCalledTimes(1);
  });
});
