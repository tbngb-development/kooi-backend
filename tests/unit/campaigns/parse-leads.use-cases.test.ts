import { describe, it, expect, vi, beforeEach } from "vitest";
import { ParseLeadsUseCase } from "../../../src/modules/campaigns/application/use-cases/parse-leads.use-case";
import { ParseManualLeadsUseCase } from "../../../src/modules/campaigns/application/use-cases/parse-manual-leads.use-case";
import type { CampaignRepository } from "../../../src/modules/campaigns/application/interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../../src/modules/batches/application/interfaces/batch-repository.interface";
import type { PlanRepository } from "../../../src/modules/plans/application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../../src/modules/wallet/application/interfaces/wallet-repository.interface";
import type { Logger } from "../../../src/shared/logging/logger.interface";
import {
  CampaignNotFoundError,
  CampaignFailedError,
} from "../../../src/modules/campaigns/domain/errors/campaign.errors";
import { TenantPlanNotFoundError } from "../../../src/modules/plans/domain/errors/plan.errors";
import { MaxLeadsPerBatchExceededError } from "../../../src/modules/batches/domain/errors/batch.errors";

function createMockCampaignRepo(): CampaignRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findByIdGlobal: vi.fn(),
    findByIdWithRelations: vi.fn(),
    getCampaignOverviewStats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    getStats: vi.fn(),
    getExtractionOverview: vi.fn(),
    getExtractionInsights: vi.fn(),
    findAssistantWithAgent: vi.fn(),
    resolveAssistantForPlatformAgent: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };
}

function createMockBatchRepo(): BatchRepository {
  return {
    findExistingPhones: vi.fn().mockResolvedValue(new Set()),
    findById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    cascadeStatusFromCampaign: vi.fn(),
    recalculateCampaignStats: vi.fn(),
    listByCampaign: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  } as unknown as BatchRepository;
}

function createMockPlanRepo(): PlanRepository {
  return {
    findCataloguePlanById: vi.fn(),
    findCataloguePlanBySlug: vi.fn(),
    listCataloguePlans: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    createDraftVersion: vi.fn(),
    findVersionById: vi.fn(),
    listVersionsForPlan: vi.fn(),
    publishVersion: vi.fn(),
    deprecateVersion: vi.fn(),
    archiveVersion: vi.fn(),
    getTenantPlan: vi.fn(),
    getActivePlanForTenant: vi.fn(),
    findDefaultPublishedVersion: vi.fn(),
    createTenantSubscription: vi.fn(),
    updateTenantSubscriptionStatus: vi.fn(),
    updateTenantPlanOverrides: vi.fn(),
    countActiveCampaigns: vi.fn(),
    countActiveAgents: vi.fn(),
    countSubscribersForPlanVersion: vi.fn(),
  };
}

function createMockWalletRepo(): WalletRepository {
  return {
    findByTenantId: vi.fn().mockResolvedValue({
      id: "wallet-123",
      tenantId: "tenant-123",
      cashBalance: 50000,
      bonusBalance: 10000,
      totalBalance: 60000,
      currency: "INR",
      bonusExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findByTenantIdWithPessimisticLock: vi.fn(),
    executeCreditAdjustment: vi.fn(),
    executeDebitAdjustment: vi.fn(),
    executeDirectDebitWithPessimisticLock: vi.fn(),
    expireBonusBalance: vi.fn(),
    listTransactions: vi.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

const mockCampaign = {
  id: "camp-123",
  tenantId: "tenant-123",
  assistantId: "asst-123",
  name: "Sales Campaign",
  description: "Test description",
  status: "DRAFT" as const,
  variables: {},
  defaultRetryConfig: null,
  totalLeads: 0,
  calledLeads: 0,
  completedLeads: 0,
  failedLeads: 0,
  startedAt: null,
  completedAt: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockActivePlan = {
  tenantPlanId: "tp-123",
  tenantId: "tenant-123",
  status: "ACTIVE" as const,
  activatedAt: new Date(),
  bonusExpiresAt: new Date(),
  planId: "p-123",
  planVersionId: "pv-123",
  version: 1,
  pricingModel: "STANDARD" as const,
  onboardingFee: 50000,
  perMinuteRate: 60, // 60 paisa per min
  billingMinimumSec: 30,
  billingIncrementSec: 10,
  maxActiveCampaigns: 5,
  maxAgents: 10,
  maxTeamMembers: 10,
  maxLeadsPerBatch: 100,
  retryAutomation: true,
  brochureUpload: true,
  includedBalance: 10000,
  bonusValidityDays: 30,
  planName: "Pro Plan",
  planSlug: "pro-plan",
  currency: "INR",
  archivedAt: null,
};

describe("ParseLeadsUseCase & ParseManualLeadsUseCase (Module 8)", () => {
  let campaignRepo: ReturnType<typeof createMockCampaignRepo>;
  let batchRepo: ReturnType<typeof createMockBatchRepo>;
  let planRepo: ReturnType<typeof createMockPlanRepo>;
  let walletRepo: ReturnType<typeof createMockWalletRepo>;
  let logger: ReturnType<typeof createMockLogger>;
  let parseLeadsUseCase: ParseLeadsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    campaignRepo = createMockCampaignRepo();
    batchRepo = createMockBatchRepo();
    planRepo = createMockPlanRepo();
    walletRepo = createMockWalletRepo();
    logger = createMockLogger();

    parseLeadsUseCase = new ParseLeadsUseCase(
      campaignRepo,
      batchRepo,
      planRepo,
      walletRepo,
      logger,
    );
  });

  describe("ParseLeadsUseCase validation & error handling", () => {
    it("throws CampaignNotFoundError when campaign is not found", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(null);

      await expect(
        parseLeadsUseCase.execute({
          tenantId: "tenant-123",
          campaignId: "non-existent-camp",
          fileBuffer: Buffer.from("contact_number\n9876543210\n"),
          fileName: "leads.csv",
        }),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("throws CampaignFailedError when campaign status is FAILED", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaign,
        status: "FAILED",
      });

      await expect(
        parseLeadsUseCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          fileBuffer: Buffer.from("contact_number\n9876543210\n"),
          fileName: "leads.csv",
        }),
      ).rejects.toThrow(CampaignFailedError);
    });

    it("throws TenantPlanNotFoundError when tenant has no active plan", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaign);
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(null);

      await expect(
        parseLeadsUseCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          fileBuffer: Buffer.from("contact_number\n9876543210\n"),
          fileName: "leads.csv",
        }),
      ).rejects.toThrow(TenantPlanNotFoundError);
    });
  });

  describe("Empty lead file handling", () => {
    it("returns zero metrics and empty cost estimation when file has header only", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaign);
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(mockActivePlan);

      const emptyCsv = Buffer.from("contact_number,customer_name\n");
      const result = await parseLeadsUseCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        fileBuffer: emptyCsv,
        fileName: "leads.csv",
      });

      expect(result.total).toBe(0);
      expect(result.valid).toBe(0);
      expect(result.readyToImport).toBe(0);
      expect(result.estimation.estimatedCostMinPaisa).toBe(0);
      expect(result.estimation.estimatedCostMaxPaisa).toBe(0);
      expect(result.estimation.currentBalancePaisa).toBe(60000); // 50000 + 10000
    });
  });

  describe("Phone validation, In-File & Cross-Batch Deduplication", () => {
    it("correctly partitions valid Indian numbers, non-Indian numbers, in-file duplicates, and DB duplicates", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaign);
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(mockActivePlan);

      // In database, +919876543211 already exists from an earlier batch
      vi.mocked(batchRepo.findExistingPhones).mockResolvedValue(
        new Set(["+919876543211"]),
      );

      const csvContent = `contact_number,customer_name
9876543210,Alice Smith
9876543210,Alice Duplicate In File
9876543211,Bob Already In DB
+14155552671,John USA
invalid-phone,Malformed Lead
9876543212,Charlie New
`;
      const buffer = Buffer.from(csvContent, "utf-8");

      const result = await parseLeadsUseCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        fileBuffer: buffer,
        fileName: "test-leads.csv",
      });

      expect(result.total).toBe(6);
      // Valid Indian numbers parsed: 9876543210 (2x), 9876543211 (1x), 9876543212 (1x) = 4
      expect(result.valid).toBe(4);
      // Non-Indian number (+14155552671): 1
      expect(result.nonIndian).toBe(1);
      expect(result.nonIndianNumbers).toContain("+14155552671");
      // Malformed / invalid: 1
      expect(result.invalid).toBe(1);
      // In-file duplicate: 9876543210
      expect(result.inFileDuplicates).toBe(1);
      expect(result.inFileDuplicateNumbers).toContain("+919876543210");
      // Cross-batch DB duplicate: 9876543211
      expect(result.dbDuplicates).toBe(1);
      expect(result.dbDuplicateNumbers).toContain("+919876543211");
      // Ready to import: Alice Smith (9876543210) and Charlie New (9876543212) = 2
      expect(result.readyToImport).toBe(2);
    });

    it("throws MaxLeadsPerBatchExceededError when readyToImport exceeds plan maxLeadsPerBatch", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaign);
      // Set plan limit to 2 leads
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        maxLeadsPerBatch: 2,
      });

      const csvContent = `contact_number,customer_name
9876543210,Lead One
9876543211,Lead Two
9876543212,Lead Three
`;
      const buffer = Buffer.from(csvContent, "utf-8");

      await expect(
        parseLeadsUseCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          fileBuffer: buffer,
          fileName: "leads.csv",
        }),
      ).rejects.toThrow(MaxLeadsPerBatchExceededError);
    });
  });

  describe("Cost estimation math", () => {
    it("accurately calculates estimated cost min/max based on billing minimum and increment", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaign);
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        perMinuteRate: 60, // 60 paisa per minute = 1 paisa per second
        billingMinimumSec: 30,
        billingIncrementSec: 10,
        maxLeadsPerBatch: null,
      });

      // 10 valid leads
      let csv = "contact_number,customer_name\n";
      for (let i = 0; i < 10; i++) {
        csv += `987654321${i},Lead ${i}\n`;
      }
      const buffer = Buffer.from(csv, "utf-8");

      const result = await parseLeadsUseCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        fileBuffer: buffer,
        fileName: "leads.csv",
      });

      expect(result.readyToImport).toBe(10);
      expect(result.estimation).toBeDefined();

      // In parse-leads.use-case:
      // leadCount = 10
      // ANSWER_RATE = 0.4
      // firstAttemptConnected = 10 * 0.4 = 4
      // firstAttemptFailed = 10 * 0.6 = 6
      // retryAttemptConnected = 6 * 0.4 = 2.4
      // totalConnectedCalls = 4 + 2.4 = 6.4
      // MIN_DURATION_SEC = 45 -> billedSec: Math.ceil(45 / 10) * 10 = 50 sec
      // MAX_DURATION_SEC = 90 -> billedSec: Math.ceil(90 / 10) * 10 = 90 sec
      // costPerCallMinPaisa = (50 / 60) * 60 = 50 paisa
      // costPerCallMaxPaisa = (90 / 60) * 60 = 90 paisa
      // estimatedCostMinPaisa = Math.round(6.4 * 50) = 320 paisa
      // estimatedCostMaxPaisa = Math.round(6.4 * 90) = 576 paisa
      expect(result.estimation.estimatedCostMinPaisa).toBe(320);
      expect(result.estimation.estimatedCostMaxPaisa).toBe(576);
      expect(result.estimation.perMinuteRatePaisa).toBe(60);
      expect(result.estimation.currentBalancePaisa).toBe(60000);
    });
  });

  describe("ParseManualLeadsUseCase", () => {
    it("serializes manual leads and delegates to ParseLeadsUseCase", async () => {
      const manualUseCase = new ParseManualLeadsUseCase(parseLeadsUseCase);
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaign);
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(mockActivePlan);

      const result = await manualUseCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        leads: [
          { contact_number: "9876543210", customer_name: "Aman Gupta" },
          { contact_number: "9876543211", customer_name: "Namita Thapar" },
        ],
      });

      expect(result.total).toBe(2);
      expect(result.valid).toBe(2);
      expect(result.readyToImport).toBe(2);
      expect(result.detectedHeaders.contact_number).toBe(true);
      expect(result.detectedHeaders.customer_name).toBe(true);
    });
  });
});
