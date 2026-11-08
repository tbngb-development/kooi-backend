import { describe, it, expect, vi, beforeEach } from "vitest";
import { BatchProcessingWorker } from "../infrastructure/jobs/batch-processing.worker";
import type { BatchRepository } from "../application/interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { BolnaBatchProvider } from "../application/interfaces/bolna-batch-provider.interface";
import type { IPhoneNumberRepository } from "../../phone-numbers/application/interfaces/phone-number-repository.interface";
import type { ISarvamCohortClient } from "../application/interfaces/sarvam-cohort-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { FileStorageProvider } from "../../../shared/config/external/storage/file-storage.interface";
import axios from "axios";

vi.mock("axios");
vi.mock("../../../../shared/utils/tenant-freeze.guard", () => ({
  assertTenantNotFrozen: vi.fn().mockResolvedValue(undefined),
}));

describe("BatchProcessingWorker (Sarvam Flow)", () => {
  let worker: BatchProcessingWorker;
  let mockBatchRepo: BatchRepository;
  let mockCampaignRepo: CampaignRepository;
  let mockPlanRepo: PlanRepository;
  let mockBolnaProvider: BolnaBatchProvider;
  let mockPhoneNumberRepo: IPhoneNumberRepository;
  let mockSarvamCohortClient: ISarvamCohortClient;
  let mockSarvamEncryptionService: ISarvamApiKeyEncryptionService;
  let mockStorage: FileStorageProvider;

  const tenantId = "tenant-sarvam-1";
  const campaignId = "camp-sarvam-1";
  const batchId = "batch-sarvam-1";
  const sarvamAgentId = "agent-sarvam-1";
  const sarvamCampaignId = "sarvam-camp-external-1";

  beforeEach(() => {
    vi.clearAllMocks();

    mockBatchRepo = {
      findById: vi.fn().mockResolvedValue({
        id: batchId,
        tenantId,
        campaignId,
        name: "Test Sarvam Batch",
        fileName: "leads.csv",
        provider: "SARVAM",
        status: "PROCESSING",
      } as any),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      findExistingPhones: vi.fn().mockResolvedValue([]),
      reassignCampaignLeadsToBatch: vi.fn().mockResolvedValue(undefined),
      createLeads: vi.fn().mockResolvedValue(2),
      findPendingLeads: vi.fn().mockResolvedValue([
        {
          id: "lead-1",
          name: "Aarav Sharma",
          phone: "+919876543210",
          email: null,
          company: null,
          metadata: { account_number: "ACC-101" },
        },
        {
          id: "lead-2",
          name: "Diya Verma",
          phone: "+919876543211",
          email: null,
          company: null,
          metadata: { account_number: "ACC-102" },
        },
      ]),
      getBatchSequenceNumber: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue({} as any),
      updateProcessingError: vi.fn().mockResolvedValue(undefined),
      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
    } as unknown as BatchRepository;

    mockCampaignRepo = {
      findByIdWithRelations: vi.fn().mockResolvedValue({
        id: campaignId,
        tenantId,
        name: "Sarvam Q1 Campaign",
        provider: "SARVAM",
        status: "SCHEDULED",
        sarvamAgentId,
        sarvamCampaignId,
        variables: {},
      } as any),
      findSarvamAgentWithApiKey: vi.fn().mockResolvedValue({
        id: sarvamAgentId,
        name: "Support Agent",
        appId: "sarvam-app-1",
        appVersion: 1,
        agentVariables: [
          {
            key: "customer_name",
            defaultValue: "",
            isTenantVisible: true,
            isTenantEditable: true,
          },
          {
            key: "account_number",
            defaultValue: "",
            isTenantVisible: true,
            isTenantEditable: true,
          },
        ],
        apiKey: {
          id: "key-1",
          tenantId,
          apiKeyEncrypted: "encrypted-key",
          workspaceId: "ws-1",
          organizationId: "org-1",
          isActive: true,
        },
        overrides: [],
      } as any),
    } as unknown as CampaignRepository;

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        id: "plan-1",
        status: "ACTIVE",
        isTrial: false,
        maxLeadsPerBatch: null,
      } as any),
    } as unknown as PlanRepository;

    mockBolnaProvider = {
      createBatch: vi.fn(),
      scheduleBatch: vi.fn(),
    } as unknown as BolnaBatchProvider;

    mockPhoneNumberRepo = {
      findOutboundPhoneNumbers: vi.fn().mockResolvedValue([]),
    } as unknown as IPhoneNumberRepository;

    mockSarvamCohortClient = {
      uploadCohort: vi.fn().mockResolvedValue({
        name: "Test Sarvam Batch",
        cohort_id: "cohort-sarvam-ext-1",
        status: "processing",
        source_type: "file_upload",
        cohort_category: "cohort",
        created_by: "system@kooi.io",
        created_at: "2026-04-01T09:00:00Z",
        updated_at: "2026-04-01T09:00:00Z",
        result: {
          total_records: 2,
          valid_records: 2,
          rejected_records: 0,
        },
      }),
      getCohort: vi.fn().mockResolvedValue({
        name: "Test Sarvam Batch",
        cohort_id: "cohort-sarvam-ext-1",
        status: "completed",
        source_type: "file_upload",
        cohort_category: "cohort",
        created_by: "system@kooi.io",
        created_at: "2026-04-01T09:00:00Z",
        updated_at: "2026-04-01T09:02:00Z",
        result: {
          total_records: 2,
          valid_records: 2,
          rejected_records: 0,
        },
      }),
    };

    mockSarvamEncryptionService = {
      decrypt: vi.fn().mockReturnValue("decrypted-sarvam-key"),
      encrypt: vi.fn(),
      maskKey: vi.fn().mockReturnValue("****"),
    };

    mockStorage = {
      uploadBuffer: vi.fn().mockResolvedValue("https://storage.example.com/transformed.csv"),
      downloadBuffer: vi.fn(),
      deleteFile: vi.fn(),
    } as unknown as FileStorageProvider;

    worker = new BatchProcessingWorker(
      mockBatchRepo,
      mockCampaignRepo,
      mockPlanRepo,
      mockBolnaProvider,
      mockPhoneNumberRepo,
      mockSarvamCohortClient,
      mockSarvamEncryptionService,
      mockStorage,
    );
  });

  it("processes and uploads a Sarvam cohort, polling status until completed", async () => {
    const csvContent =
      "Contact Number,Customer Name,account_number\n+919876543210,Aarav Sharma,ACC-101\n+919876543211,Diya Verma,ACC-102";

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: Buffer.from(csvContent, "utf-8"),
    });

    const job = {
      data: {
        batchId,
        tenantId,
        campaignId,
        rawFileUrl: "https://storage.example.com/raw.csv",
        fileName: "leads.csv",
        scheduledAt: null,
        runImmediately: false,
        retryConfig: null,
        termsVersion: "1.0",
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
    } as any;

    await worker.process(job);

    // Verify raw file was downloaded
    expect(axios.get).toHaveBeenCalledWith(
      "https://storage.example.com/raw.csv",
      expect.anything(),
    );

    // Verify Sarvam key decryption
    expect(mockSarvamEncryptionService.decrypt).toHaveBeenCalledWith(
      "encrypted-key",
    );

    // Verify storage of transformed CSV
    expect(mockStorage.uploadBuffer).toHaveBeenCalled();

    // Verify cohort upload
    expect(mockSarvamCohortClient.uploadCohort).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        workspaceId: "ws-1",
        campaignId: sarvamCampaignId,
        apiKey: "decrypted-sarvam-key",
        cohortCategory: "cohort",
      }),
    );

    // Verify status was polled
    expect(mockSarvamCohortClient.getCohort).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortId: "cohort-sarvam-ext-1",
        apiKey: "decrypted-sarvam-key",
      }),
    );

    // Verify batch was updated with cohort ID and finalized status SCHEDULED
    expect(mockBatchRepo.update).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        sarvamCohortId: "cohort-sarvam-ext-1",
        status: "SCHEDULED",
      }),
    );

    // Verify campaign stats recalculated
    expect(mockBatchRepo.recalculateCampaignStats).toHaveBeenCalledWith(
      campaignId,
    );
  });

  it("succeeds and uploads cohort when non-phone variables are missing from CSV", async () => {
    // CSV only has Contact Number; account_number should fall back to empty string
    const csvContent =
      "Contact Number,Customer Name\n+919876543210,Aarav Sharma";

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: Buffer.from(csvContent, "utf-8"),
    });

    vi.mocked(mockBatchRepo.findPendingLeads).mockResolvedValueOnce([
      {
        id: "lead-1",
        name: "Aarav Sharma",
        phone: "+919876543210",
        email: null,
        company: null,
        metadata: {},
      },
    ]);

    const job = {
      data: {
        batchId,
        tenantId,
        campaignId,
        rawFileUrl: "https://storage.example.com/raw.csv",
        fileName: "leads.csv",
        scheduledAt: null,
        runImmediately: false,
        retryConfig: null,
        termsVersion: "1.0",
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
    } as any;

    await worker.process(job);

    expect(mockSarvamCohortClient.uploadCohort).toHaveBeenCalled();
    expect(mockBatchRepo.update).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        sarvamCohortId: "cohort-sarvam-ext-1",
      }),
    );
  });

  it("defaults scheduledAt to current timestamp when runImmediately is true", async () => {
    const csvContent =
      "Contact Number,Customer Name,account_number\n+919876543210,Aarav Sharma,ACC-101";

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: Buffer.from(csvContent, "utf-8"),
    });

    const before = Date.now();
    const job = {
      data: {
        batchId,
        tenantId,
        campaignId,
        rawFileUrl: "https://storage.example.com/raw.csv",
        fileName: "leads.csv",
        scheduledAt: null,
        runImmediately: true,
        retryConfig: null,
        termsVersion: "1.0",
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
    } as any;

    await worker.process(job);

    expect(mockBatchRepo.update).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        sarvamCohortId: "cohort-sarvam-ext-1",
        status: "RUNNING",
        scheduledAt: expect.any(Date),
      }),
    );

    const updateCalls = vi.mocked(mockBatchRepo.update).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    const savedDate = lastCall[1].scheduledAt as Date;
    expect(savedDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(savedDate.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("preserves supplied future timestamp when scheduledAt is provided", async () => {
    const csvContent =
      "Contact Number,Customer Name,account_number\n+919876543210,Aarav Sharma,ACC-101";

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: Buffer.from(csvContent, "utf-8"),
    });

    const scheduledDateStr = "2026-06-15T10:00:00.000Z";
    const job = {
      data: {
        batchId,
        tenantId,
        campaignId,
        rawFileUrl: "https://storage.example.com/raw.csv",
        fileName: "leads.csv",
        scheduledAt: scheduledDateStr,
        runImmediately: false,
        retryConfig: null,
        termsVersion: "1.0",
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
    } as any;

    await worker.process(job);

    expect(mockBatchRepo.update).toHaveBeenCalledWith(
      batchId,
      expect.objectContaining({
        sarvamCohortId: "cohort-sarvam-ext-1",
        status: "SCHEDULED",
        scheduledAt: new Date(scheduledDateStr),
      }),
    );
  });
});
