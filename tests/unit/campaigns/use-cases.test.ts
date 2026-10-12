import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "../../../src/shared/config/database/prisma";
import { CreateCampaignUseCase } from "../../../src/modules/campaigns/application/use-cases/create-campaign.use-case";
import { UpdateCampaignStatusUseCase } from "../../../src/modules/campaigns/application/use-cases/update-campaign-status.use-case";
import { ArchiveCampaignUseCase } from "../../../src/modules/campaigns/application/use-cases/archive-campaign.use-case";
import { RestoreCampaignUseCase } from "../../../src/modules/campaigns/application/use-cases/restore-campaign.use-case";
import { GetCampaignUseCase } from "../../../src/modules/campaigns/application/use-cases/get-campaign.use-case";
import { ListCampaignsUseCase } from "../../../src/modules/campaigns/application/use-cases/list-campaigns.use-case";
import { UpdateDraftCampaignUseCase } from "../../../src/modules/campaigns/application/use-cases/update-draft-campaign.use-case";
import { GetCampaignStatsUseCase } from "../../../src/modules/campaigns/application/use-cases/get-campaign-stats.use-case";
import { GetCampaignExtractionOverviewUseCase } from "../../../src/modules/campaigns/application/use-cases/get-campaign-extraction-overview.use-case";
import { GetCampaignExtractionInsightsUseCase } from "../../../src/modules/campaigns/application/use-cases/get-campaign-extraction-insights.use-case";

import type {
  CampaignRepository,
  AssistantWithAgentData,
} from "../../../src/modules/campaigns/application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../../src/modules/plans/application/interfaces/plan-repository.interface";
import type { BatchRepository } from "../../../src/modules/batches/application/interfaces/batch-repository.interface";
import type { Logger } from "../../../src/shared/logging/logger.interface";
import type { CampaignEntityData } from "../../../src/modules/campaigns/domain/entities/campaign.entity";

import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  CampaignNotDeletedError,
  CampaignNotArchivableError,
  CampaignNotDraftError,
  CampaignAssistantNotFoundError,
  MissingRequiredVariablesError,
  RetryConfigNotAllowedError,
  MaxActiveCampaignsReachedError,
} from "../../../src/modules/campaigns/domain/errors/campaign.errors";
import { PlatformAgentNotFoundError } from "../../../src/modules/platform-agents/domain/errors/platform-agent.errors";
import { TenantWorkspaceFrozenError } from "../../../src/shared/errors/frozen.error";
import { TenantKeyDeactivatedError } from "../../../src/shared/errors/key-deactivated.error";

vi.mock("../../../src/shared/config/database/prisma", () => ({
  default: {
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

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

function createMockBatchRepo(): BatchRepository {
  return {
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

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

const mockCampaignEntityData: CampaignEntityData = {
  id: "camp-123",
  tenantId: "tenant-123",
  assistantId: "asst-123",
  name: "Q4 Outbound Sales",
  description: "Test description",
  status: "DRAFT",
  variables: { customer_name: "John Doe" },
  defaultRetryConfig: null,
  totalLeads: 0,
  calledLeads: 0,
  completedLeads: 0,
  failedLeads: 0,
  startedAt: null,
  completedAt: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("Campaign Application Use Cases (Module 7)", () => {
  let campaignRepo: ReturnType<typeof createMockCampaignRepo>;
  let planRepo: ReturnType<typeof createMockPlanRepo>;
  let batchRepo: ReturnType<typeof createMockBatchRepo>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    campaignRepo = createMockCampaignRepo();
    planRepo = createMockPlanRepo();
    batchRepo = createMockBatchRepo();
    logger = createMockLogger();

    // Default: tenant is not frozen and key is active
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      workspaceSwitchStatus: null,
      bolnaApiKey: { isActive: true },
    } as any);
  });

  describe("CreateCampaignUseCase", () => {
    let useCase: CreateCampaignUseCase;

    beforeEach(() => {
      useCase = new CreateCampaignUseCase(campaignRepo, planRepo, logger);
    });

    it("throws TenantWorkspaceFrozenError when tenant is undergoing migration", async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        workspaceSwitchStatus: "CLONING",
        bolnaApiKey: { isActive: true },
      } as any);

      await expect(
        useCase.execute("tenant-123", {
          name: "Test Campaign",
          assistantId: "asst-123",
        }),
      ).rejects.toThrow(TenantWorkspaceFrozenError);
    });

    it("throws TenantKeyDeactivatedError when tenant's Bolna key is deactivated", async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        workspaceSwitchStatus: null,
        bolnaApiKey: { isActive: false },
      } as any);

      await expect(
        useCase.execute("tenant-123", {
          name: "Test Campaign",
          assistantId: "asst-123",
        }),
      ).rejects.toThrow(TenantKeyDeactivatedError);
    });

    it("throws MaxActiveCampaignsReachedError when tenant reaches plan limit", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        maxActiveCampaigns: 2,
        retryAutomation: true,
      } as any);
      vi.mocked(planRepo.countActiveCampaigns).mockResolvedValue(2);

      await expect(
        useCase.execute("tenant-123", {
          name: "Campaign 3",
          assistantId: "asst-123",
        }),
      ).rejects.toThrow(MaxActiveCampaignsReachedError);

      expect(logger.warn).toHaveBeenCalledWith(
        "Max active campaigns reached",
        expect.objectContaining({ activeCount: 2, limit: 2 }),
      );
    });

    it("throws CampaignAssistantNotFoundError when assistant does not exist under tenant", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        maxActiveCampaigns: 5,
        retryAutomation: true,
      } as any);
      vi.mocked(planRepo.countActiveCampaigns).mockResolvedValue(1);
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", {
          name: "New Campaign",
          assistantId: "non-existent-assistant",
        }),
      ).rejects.toThrow(CampaignAssistantNotFoundError);
    });

    it("throws MissingRequiredVariablesError when required variables are missing", async () => {
      const mockAssistant: AssistantWithAgentData = {
        id: "asst-123",
        name: "Sales Rep",
        platformAgent: {
          id: "agent-1",
          bolnaId: "bolna-agent-1",
          requiredVariables: [
            {
              name: "project_name",
              label: "Project Name",
              required: true,
              isEditable: true,
            },
          ],
        },
      };

      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        maxActiveCampaigns: 5,
        retryAutomation: true,
      } as any);
      vi.mocked(planRepo.countActiveCampaigns).mockResolvedValue(0);
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(mockAssistant);

      await expect(
        useCase.execute("tenant-123", {
          name: "New Campaign",
          assistantId: "asst-123",
          variables: {}, // missing project_name
        }),
      ).rejects.toThrow(MissingRequiredVariablesError);
    });

    it("throws RetryConfigNotAllowedError when retry automation is disabled by plan but enabled in input", async () => {
      const mockAssistant: AssistantWithAgentData = {
        id: "asst-123",
        name: "Sales Rep",
        platformAgent: {
          id: "agent-1",
          bolnaId: "bolna-agent-1",
          requiredVariables: [],
        },
      };

      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        maxActiveCampaigns: 5,
        retryAutomation: false, // Plan disallows retry automation
      } as any);
      vi.mocked(planRepo.countActiveCampaigns).mockResolvedValue(0);
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(mockAssistant);

      await expect(
        useCase.execute("tenant-123", {
          name: "Retry Campaign",
          assistantId: "asst-123",
          defaultRetryConfig: {
            enabled: true,
            max_retries: 2,
          },
        }),
      ).rejects.toThrow(RetryConfigNotAllowedError);
    });

    it("strips retry config if plan disallows retry automation and input has retry disabled", async () => {
      const mockAssistant: AssistantWithAgentData = {
        id: "asst-123",
        name: "Sales Rep",
        platformAgent: {
          id: "agent-1",
          bolnaId: "bolna-agent-1",
          requiredVariables: [],
        },
      };

      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        maxActiveCampaigns: 5,
        retryAutomation: false,
      } as any);
      vi.mocked(planRepo.countActiveCampaigns).mockResolvedValue(0);
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(mockAssistant);
      vi.mocked(campaignRepo.create).mockResolvedValue(mockCampaignEntityData);

      await useCase.execute("tenant-123", {
        name: "Retry Disabled Campaign",
        assistantId: "asst-123",
        defaultRetryConfig: {
          enabled: false,
        },
      });

      expect(campaignRepo.create).toHaveBeenCalledWith(
        "tenant-123",
        expect.objectContaining({
          defaultRetryConfig: undefined,
        }),
      );
    });

    it("successfully creates campaign and logs info when all rules and limits pass", async () => {
      const mockAssistant: AssistantWithAgentData = {
        id: "asst-123",
        name: "Sales Rep",
        platformAgent: {
          id: "agent-1",
          bolnaId: "bolna-agent-1",
          requiredVariables: [
            {
              name: "project_name",
              label: "Project Name",
              required: true,
              isEditable: true,
            },
            {
              name: "system_tag",
              label: "System Tag",
              required: true,
              isEditable: false,
            },
          ],
        },
      };

      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        maxActiveCampaigns: null, // unlimited
        retryAutomation: true,
      } as any);
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(mockAssistant);
      vi.mocked(campaignRepo.create).mockResolvedValue(mockCampaignEntityData);

      const result = await useCase.execute("tenant-123", {
        name: "Green Horizon Launch",
        assistantId: "asst-123",
        variables: {
          project_name: "Green Horizon",
          system_tag: "HACKED_TAG",
        },
        defaultRetryConfig: {
          enabled: true,
          max_retries: 3,
        },
      });

      expect(result).toEqual(mockCampaignEntityData);
      expect(campaignRepo.create).toHaveBeenCalledWith(
        "tenant-123",
        expect.objectContaining({
          name: "Green Horizon Launch",
          variables: {
            project_name: "Green Horizon", // system_tag stripped because isEditable=false
          },
          defaultRetryConfig: {
            enabled: true,
            max_retries: 3,
          },
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Campaign created",
        expect.objectContaining({
          action: "campaign.create",
          tenantId: "tenant-123",
          campaignId: mockCampaignEntityData.id,
        }),
      );
    });
  });

  describe("UpdateCampaignStatusUseCase", () => {
    let useCase: UpdateCampaignStatusUseCase;

    beforeEach(() => {
      useCase = new UpdateCampaignStatusUseCase(campaignRepo, batchRepo, logger);
    });

    it("throws CampaignNotFoundError when campaign does not exist under tenant", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "non-existent-camp",
          status: "RUNNING",
        }),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("sets startedAt timestamp when transitioning to RUNNING and preserves existing if set", async () => {
      const existingStartedAt = new Date("2026-02-01");
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        startedAt: existingStartedAt,
      });
      vi.mocked(campaignRepo.updateStatus).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "RUNNING",
        startedAt: existingStartedAt,
      });

      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "RUNNING",
      });

      expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
        "camp-123",
        "RUNNING",
        { startedAt: existingStartedAt },
      );
    });

    it("sets new startedAt timestamp when transitioning to RUNNING if startedAt was null", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        startedAt: null,
      });
      vi.mocked(campaignRepo.updateStatus).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "RUNNING",
      });

      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "RUNNING",
      });

      expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
        "camp-123",
        "RUNNING",
        expect.objectContaining({ startedAt: expect.any(Date) }),
      );
    });

    it("sets completedAt timestamp when transitioning to COMPLETED or FAILED", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.updateStatus).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "COMPLETED",
      });

      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "COMPLETED",
      });

      expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
        "camp-123",
        "COMPLETED",
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );

      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "FAILED",
      });

      expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
        "camp-123",
        "FAILED",
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );
    });

    it("cascades status to batches according to status mapping", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.updateStatus).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "COMPLETED",
      });

      // COMPLETED -> cascades COMPLETED
      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "COMPLETED",
        cascadeToBatches: true,
      });
      expect(batchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
        "camp-123",
        "COMPLETED",
      );

      // FAILED -> cascades FAILED
      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "FAILED",
        cascadeToBatches: true,
      });
      expect(batchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
        "camp-123",
        "FAILED",
      );

      // DRAFT -> cascades STOPPED
      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "DRAFT",
        cascadeToBatches: true,
      });
      expect(batchRepo.cascadeStatusFromCampaign).toHaveBeenCalledWith(
        "camp-123",
        "STOPPED",
      );
    });

    it("skips cascading to batches when cascadeToBatches is false", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.updateStatus).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "COMPLETED",
      });

      await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "COMPLETED",
        cascadeToBatches: false,
      });

      expect(batchRepo.cascadeStatusFromCampaign).not.toHaveBeenCalled();
    });

    it("recalculates stats and catches error gracefully without throwing", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.updateStatus).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "COMPLETED",
      });
      vi.mocked(batchRepo.recalculateCampaignStats).mockRejectedValue(
        new Error("DB timeout during stats recalculation"),
      );

      const result = await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "COMPLETED",
      });

      expect(result).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to recalculate campaign stats after manual status update",
        expect.objectContaining({
          campaignId: "camp-123",
          error: "DB timeout during stats recalculation",
        }),
      );
    });
  });

  describe("ArchiveCampaignUseCase", () => {
    let useCase: ArchiveCampaignUseCase;

    beforeEach(() => {
      useCase = new ArchiveCampaignUseCase(campaignRepo);
    });

    it("throws CampaignNotFoundError when campaign is not found", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", "non-existent-camp"),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("throws CampaignAlreadyDeletedError when campaign is already soft deleted", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        isDeleted: true,
        deletedAt: new Date(),
      });

      await expect(
        useCase.execute("tenant-123", "camp-123"),
      ).rejects.toThrow(CampaignAlreadyDeletedError);
    });

    it("throws CampaignNotArchivableError when campaign is in RUNNING status", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "RUNNING",
      });

      await expect(
        useCase.execute("tenant-123", "camp-123"),
      ).rejects.toThrow(CampaignNotArchivableError);
    });

    it("successfully soft deletes campaign when in DRAFT, COMPLETED, or FAILED status", async () => {
      for (const status of ["DRAFT", "COMPLETED", "FAILED"] as const) {
        vi.mocked(campaignRepo.findById).mockResolvedValue({
          ...mockCampaignEntityData,
          status,
          isDeleted: false,
        });

        await useCase.execute("tenant-123", "camp-123");

        expect(campaignRepo.softDelete).toHaveBeenCalledWith("tenant-123", "camp-123");
      }
    });
  });

  describe("RestoreCampaignUseCase", () => {
    let useCase: RestoreCampaignUseCase;

    beforeEach(() => {
      useCase = new RestoreCampaignUseCase(campaignRepo);
    });

    it("throws CampaignNotFoundError when campaign is not found", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", "non-existent-camp"),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("throws CampaignNotDeletedError when campaign is not currently deleted", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        isDeleted: false,
      });

      await expect(
        useCase.execute("tenant-123", "camp-123"),
      ).rejects.toThrow(CampaignNotDeletedError);
    });

    it("successfully calls campaignRepo.restore when campaign is deleted", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        isDeleted: true,
        deletedAt: new Date(),
      });

      await useCase.execute("tenant-123", "camp-123");

      expect(campaignRepo.restore).toHaveBeenCalledWith("tenant-123", "camp-123");
    });
  });

  describe("GetCampaignUseCase", () => {
    let useCase: GetCampaignUseCase;

    beforeEach(() => {
      useCase = new GetCampaignUseCase(campaignRepo);
    });

    it("throws CampaignNotFoundError when campaign with relations does not exist", async () => {
      vi.mocked(campaignRepo.findByIdWithRelations).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", "non-existent-camp"),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("returns campaign with overview stats when found", async () => {
      const mockCampaignWithRelations = {
        ...mockCampaignEntityData,
        assistant: {
          id: "asst-1",
          name: "Assistant A",
          platformAgent: { bolnaId: "bolna-1" },
        },
        batches: [{ id: "batch-1", status: "COMPLETED" }],
      };

      const mockOverview = {
        totalLeads: 100,
        contactedLeads: 80,
        completedLeads: 70,
        failedLeads: 10,
        avgCallDurationSec: 120,
        totalCostPaisa: 5000,
      } as any;

      vi.mocked(campaignRepo.findByIdWithRelations).mockResolvedValue(mockCampaignWithRelations);
      vi.mocked(campaignRepo.getCampaignOverviewStats).mockResolvedValue(mockOverview);

      const result = await useCase.execute("tenant-123", "camp-123");

      expect(result).toEqual({
        ...mockCampaignWithRelations,
        overview: mockOverview,
      });
      expect(campaignRepo.findByIdWithRelations).toHaveBeenCalledWith("tenant-123", "camp-123");
      expect(campaignRepo.getCampaignOverviewStats).toHaveBeenCalledWith("tenant-123", "camp-123");
    });
  });

  describe("ListCampaignsUseCase", () => {
    let useCase: ListCampaignsUseCase;

    beforeEach(() => {
      useCase = new ListCampaignsUseCase(campaignRepo);
    });

    it("delegates to campaignRepo.list splitting tenantId from filters", async () => {
      const mockResult = {
        items: [mockCampaignEntityData],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      } as any;

      vi.mocked(campaignRepo.list).mockResolvedValue(mockResult);

      const result = await useCase.execute({
        tenantId: "tenant-123",
        search: "sales",
        page: 1,
        limit: 10,
      });

      expect(result).toEqual(mockResult);
      expect(campaignRepo.list).toHaveBeenCalledWith("tenant-123", {
        search: "sales",
        page: 1,
        limit: 10,
      });
    });
  });

  describe("UpdateDraftCampaignUseCase", () => {
    let useCase: UpdateDraftCampaignUseCase;

    beforeEach(() => {
      useCase = new UpdateDraftCampaignUseCase(campaignRepo, logger);
    });

    it("throws CampaignNotFoundError when campaign does not exist", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "non-existent-camp",
          name: "Updated Name",
        }),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("throws CampaignAlreadyDeletedError when campaign is deleted", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        isDeleted: true,
      });

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          name: "Updated Name",
        }),
      ).rejects.toThrow(CampaignAlreadyDeletedError);
    });

    it("throws CampaignNotDraftError when campaign status is not DRAFT", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        status: "RUNNING",
      });

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          name: "Updated Name",
        }),
      ).rejects.toThrow(CampaignNotDraftError);
    });

    it("throws CampaignAssistantNotFoundError when target assistant does not exist", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          assistantId: "different-asst-id",
        }),
      ).rejects.toThrow(CampaignAssistantNotFoundError);
    });

    it("throws PlatformAgentNotFoundError when platformAgentId cannot be resolved", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.resolveAssistantForPlatformAgent).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          platformAgentId: "unknown-agent-id",
        }),
      ).rejects.toThrow(PlatformAgentNotFoundError);
    });

    it("validates and cleans updated variables against assistant requiredVariables", async () => {
      const mockAssistant: AssistantWithAgentData = {
        id: "asst-123",
        name: "Assistant Rep",
        platformAgent: {
          id: "agent-1",
          bolnaId: "bolna-1",
          requiredVariables: [
            {
              name: "target_city",
              label: "Target City",
              required: true,
              isEditable: true,
            },
          ],
        },
      };

      vi.mocked(campaignRepo.findById).mockResolvedValue({
        ...mockCampaignEntityData,
        variables: {},
      });
      vi.mocked(campaignRepo.findAssistantWithAgent).mockResolvedValue(mockAssistant);

      // Missing target_city
      await expect(
        useCase.execute({
          tenantId: "tenant-123",
          campaignId: "camp-123",
          variables: {},
        }),
      ).rejects.toThrow(MissingRequiredVariablesError);
    });

    it("successfully updates draft campaign attributes", async () => {
      vi.mocked(campaignRepo.findById).mockResolvedValue(mockCampaignEntityData);
      vi.mocked(campaignRepo.update).mockResolvedValue({
        ...mockCampaignEntityData,
        name: "Renamed Campaign",
        description: "New description",
      });

      const result = await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        name: "  Renamed Campaign  ",
        description: "New description",
      });

      expect(result.name).toBe("Renamed Campaign");
      expect(campaignRepo.update).toHaveBeenCalledWith(
        "tenant-123",
        "camp-123",
        expect.objectContaining({
          name: "Renamed Campaign",
          description: "New description",
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        "Draft campaign updated by Platform Admin",
        expect.objectContaining({
          action: "campaign.draft.admin_update",
          campaignId: "camp-123",
        }),
      );
    });
  });

  describe("Simple Extraction & Stats Use Cases", () => {
    it("GetCampaignStatsUseCase returns stats or throws CampaignNotFoundError", async () => {
      const useCase = new GetCampaignStatsUseCase(campaignRepo);

      vi.mocked(campaignRepo.getStats).mockResolvedValue(null as any);
      await expect(
        useCase.execute("tenant-123", "camp-123"),
      ).rejects.toThrow(CampaignNotFoundError);

      const mockStats = { campaign: mockCampaignEntityData, leads: [], calls: [] } as any;
      vi.mocked(campaignRepo.getStats).mockResolvedValue(mockStats);

      const result = await useCase.execute("tenant-123", "camp-123");
      expect(result).toEqual(mockStats);
    });

    it("GetCampaignExtractionOverviewUseCase delegates to campaignRepo.getExtractionOverview", async () => {
      const useCase = new GetCampaignExtractionOverviewUseCase(campaignRepo);
      const mockOverview = { categories: [] } as any;
      vi.mocked(campaignRepo.getExtractionOverview).mockResolvedValue(mockOverview);

      const result = await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        batchId: "batch-1",
      });

      expect(result).toEqual(mockOverview);
      expect(campaignRepo.getExtractionOverview).toHaveBeenCalledWith(
        "tenant-123",
        "camp-123",
        "batch-1",
      );
    });

    it("GetCampaignExtractionInsightsUseCase delegates to campaignRepo.getExtractionInsights", async () => {
      const useCase = new GetCampaignExtractionInsightsUseCase(campaignRepo);
      const mockInsights = { insights: [] } as any;
      vi.mocked(campaignRepo.getExtractionInsights).mockResolvedValue(mockInsights);

      const result = await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        batchId: "batch-1",
        topN: 5,
      });

      expect(result).toEqual(mockInsights);
      expect(campaignRepo.getExtractionInsights).toHaveBeenCalledWith(
        "tenant-123",
        "camp-123",
        "batch-1",
        5,
      );
    });
  });
});
