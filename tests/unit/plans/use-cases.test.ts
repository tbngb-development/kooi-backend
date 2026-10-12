import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectPlanUseCase } from "../../../src/modules/plans/application/use-cases/select-plan.use-case";
import { ActivateTenantPlanUseCase } from "../../../src/modules/plans/application/use-cases/activate-tenant-plan.use-case";
import { CreatePlanVersionUseCase } from "../../../src/modules/plans/application/use-cases/create-plan-version.use-case";
import { PublishPlanVersionUseCase } from "../../../src/modules/plans/application/use-cases/publish-plan-version.use-case";
import { ArchivePlanVersionUseCase } from "../../../src/modules/plans/application/use-cases/archive-plan-version.use-case";
import { UpdateTenantPlanOverridesUseCase } from "../../../src/modules/plans/application/use-cases/update-tenant-plan-overrides.use-case";
import { ChangeTenantPlanUseCase } from "../../../src/modules/plans/application/use-cases/change-tenant-plan.use-case";
import type {
  PlanRepository,
  TenantActivePlan,
} from "../../../src/modules/plans/application/interfaces/plan-repository.interface";
import {
  PlanNotFoundError,
  PlanVersionNotFoundError,
  TenantPlanAlreadyActiveError,
  CustomPlanSelectionNotAllowedError,
  NoPublishedPlanVersionError,
  TenantPlanNotFoundError,
  PlanNotActiveError,
} from "../../../src/modules/plans/domain/errors/plan.errors";
import type { Plan, PlanVersion, TenantPlan } from "@prisma/client";

function createMockPlanRepo(): PlanRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    listActive: vi.fn(),
    listAll: vi.fn(),
    findVersionById: vi.fn(),
    findLatestPublishedVersion: vi.fn(),
    createVersion: vi.fn(),
    publishVersion: vi.fn(),
    archiveVersion: vi.fn(),
    getActivePlanForTenant: vi.fn(),
    getTenantPlan: vi.fn(),
    selectPlan: vi.fn(),
    activatePlan: vi.fn(),
    updateOverrides: vi.fn(),
    updateStatus: vi.fn(),
    listSubscribers: vi.fn(),
    recordBonusExpiredEvent: vi.fn(),
    countActiveCampaigns: vi.fn(),
    countRunningCampaigns: vi.fn(),
    countConcurrentCampaignsAtTime: vi.fn(),
    countAgents: vi.fn(),
    countTeamMembers: vi.fn(),
  };
}

const mockPlan: Plan & { versions: PlanVersion[] } = {
  id: "plan-1",
  name: "Growth Plan",
  slug: "growth-plan",
  description: "Growth tier",
  displayOrder: 2,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  versions: [],
};

const mockPlanVersion: PlanVersion = {
  id: "pv-1",
  planId: "plan-1",
  version: 1,
  status: "PUBLISHED",
  currency: "INR",
  pricingModel: "STANDARD",
  onboardingFee: 50000,
  onboardingFeeOriginal: 60000,
  perMinuteRate: 150,
  billingMinimumSec: 30,
  billingIncrementSec: 15,
  maxActiveCampaigns: 5,
  maxLeadsPerBatch: 1000,
  maxAgents: 3,
  maxTeamMembers: 5,
  retryAutomation: true,
  industryPackLimit: 1,
  callingChannel: "SHARED",
  brochureUpload: true,
  dashboardTier: "STANDARD",
  agentCapability: "BASIC_KNOWLEDGE",
  integrations: "BASIC",
  supportTier: "STANDARD",
  lowBalanceThreshold: 5000,
  includedBalance: 10000,
  bonusValidityDays: 30,
  publishedAt: new Date(),
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockActiveTenantPlan: TenantActivePlan = {
  tenantPlanId: "tp-1",
  tenantId: "tenant-1",
  status: "ACTIVE",
  activatedAt: new Date(),
  bonusExpiresAt: new Date(Date.now() + 86400000),
  planId: "plan-1",
  planVersionId: "pv-1",
  version: 1,
  currency: "INR",
  pricingModel: "STANDARD",
  onboardingFee: 50000,
  onboardingFeeOriginal: null,
  perMinuteRate: 150,
  billingMinimumSec: 30,
  billingIncrementSec: 15,
  maxActiveCampaigns: 5,
  maxLeadsPerBatch: 1000,
  maxAgents: 3,
  maxTeamMembers: 5,
  retryAutomation: true,
  brochureUpload: true,
  industryPackLimit: 1,
  callingChannel: "SHARED",
  dashboardTier: "STANDARD",
  agentCapability: "BASIC_KNOWLEDGE",
  integrations: "BASIC",
  supportTier: "STANDARD",
  lowBalanceThreshold: 5000,
  includedBalance: 10000,
  bonusValidityDays: 30,
  planDisplayOrder: 2,
  planName: "Growth Plan",
  planSlug: "growth-plan",
  isCustomPriced: false,
};

describe("Plan Application Use Cases (Module 4 - Commercial Rules & Lifecycle)", () => {
  let mockRepo: PlanRepository;

  beforeEach(() => {
    mockRepo = createMockPlanRepo();
  });

  describe("SelectPlanUseCase", () => {
    let useCase: SelectPlanUseCase;

    beforeEach(() => {
      useCase = new SelectPlanUseCase(mockRepo);
    });

    it("throws PlanNotFoundError when plan does not exist", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-1", "non-existent-id"),
      ).rejects.toThrow(PlanNotFoundError);
    });

    it("throws PlanNotFoundError when plan is inactive", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue({
        ...mockPlan,
        isActive: false,
      });

      await expect(useCase.execute("tenant-1", "plan-1")).rejects.toThrow(
        PlanNotFoundError,
      );
    });

    it("throws NoPublishedPlanVersionError when plan has no published version", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(mockPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue(null);

      await expect(useCase.execute("tenant-1", "plan-1")).rejects.toThrow(
        NoPublishedPlanVersionError,
      );
    });

    it("throws CustomPlanSelectionNotAllowedError when latest published pricingModel is CUSTOM", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(mockPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue({
        ...mockPlanVersion,
        pricingModel: "CUSTOM",
      });

      await expect(useCase.execute("tenant-1", "plan-1")).rejects.toThrow(
        CustomPlanSelectionNotAllowedError,
      );
    });

    it("throws TenantPlanAlreadyActiveError when tenant already has an ACTIVE plan", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(mockPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue(
        mockPlanVersion,
      );
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        mockActiveTenantPlan,
      );

      await expect(useCase.execute("tenant-1", "plan-1")).rejects.toThrow(
        TenantPlanAlreadyActiveError,
      );
    });

    it("successfully delegates to planRepo.selectPlan when prerequisites are satisfied", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(mockPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue(
        mockPlanVersion,
      );
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(null);

      const expectedTenantPlan = {
        id: "tp-new",
        tenantId: "tenant-1",
        planId: "plan-1",
        planVersionId: "pv-1",
        status: "PENDING_PAYMENT",
        onboardingFeeOverride: null,
        perMinuteRateOverride: null,
        billingMinimumSecOverride: null,
        billingIncrementSecOverride: null,
        maxActiveCampaignsOverride: null,
        maxLeadsPerBatchOverride: null,
        maxAgentsOverride: null,
        maxTeamMembersOverride: null,
        retryAutomationOverride: null,
        brochureUploadOverride: null,
        callingChannelOverride: null,
        dashboardTierOverride: null,
        agentCapabilityOverride: null,
        integrationsOverride: null,
        supportTierOverride: null,
        customFeatures: null,
        contractDocumentUrl: null,
        notes: null,
        activatedAt: null,
        bonusExpiresAt: null,
        createdBy: "user-1",
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TenantPlan;

      vi.mocked(mockRepo.selectPlan).mockResolvedValue(expectedTenantPlan);

      const result = await useCase.execute("tenant-1", "plan-1", "user-1");

      expect(mockRepo.selectPlan).toHaveBeenCalledWith(
        "tenant-1",
        "plan-1",
        "pv-1",
        "user-1",
      );
      expect(result).toBe(expectedTenantPlan);
    });
  });

  describe("ActivateTenantPlanUseCase", () => {
    let useCase: ActivateTenantPlanUseCase;

    beforeEach(() => {
      useCase = new ActivateTenantPlanUseCase(mockRepo);
    });

    it("throws PlanVersionNotFoundError when version does not exist", async () => {
      vi.mocked(mockRepo.findVersionById).mockResolvedValue(null);

      await expect(
        useCase.execute({ tenantId: "tenant-1", planVersionId: "pv-invalid" }),
      ).rejects.toThrow(PlanVersionNotFoundError);
    });

    it("computes bonus expiration timestamp correctly when bonusValidityDays is set", async () => {
      const now = 1700000000000;
      vi.spyOn(Date, "now").mockReturnValue(now);

      vi.mocked(mockRepo.findVersionById).mockResolvedValue({
        ...mockPlanVersion,
        bonusValidityDays: 14,
        includedBalance: 5000,
      });

      const res = await useCase.execute({
        tenantId: "tenant-1",
        planVersionId: "pv-1",
        createdBy: "payment-webhook",
      });

      const expectedBonusExpiry = new Date(now + 14 * 24 * 60 * 60 * 1000);
      expect(mockRepo.activatePlan).toHaveBeenCalledWith(
        "tenant-1",
        "pv-1",
        expectedBonusExpiry,
        "payment-webhook",
      );
      expect(res).toEqual({
        tenantId: "tenant-1",
        planVersionId: "pv-1",
        bonusExpiresAt: expectedBonusExpiry,
        includedBalance: 5000,
      });

      vi.restoreAllMocks();
    });

    it("sets bonusExpiresAt to null when bonusValidityDays is null", async () => {
      vi.mocked(mockRepo.findVersionById).mockResolvedValue({
        ...mockPlanVersion,
        bonusValidityDays: null,
        includedBalance: 0,
      });

      const res = await useCase.execute({
        tenantId: "tenant-1",
        planVersionId: "pv-1",
      });

      expect(mockRepo.activatePlan).toHaveBeenCalledWith(
        "tenant-1",
        "pv-1",
        null,
        undefined,
      );
      expect(res.bonusExpiresAt).toBeNull();
      expect(res.includedBalance).toBe(0);
    });
  });

  describe("Version Lifecycle: Create, Publish, Archive", () => {
    it("CreatePlanVersionUseCase throws PlanNotFoundError when plan does not exist", async () => {
      const useCase = new CreatePlanVersionUseCase(mockRepo);
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("non-existent", {
          onboardingFee: 1000,
          perMinuteRate: 100,
        }),
      ).rejects.toThrow(PlanNotFoundError);
    });

    it("PublishPlanVersionUseCase throws PlanVersionNotFoundError for missing version", async () => {
      const useCase = new PublishPlanVersionUseCase(mockRepo);
      vi.mocked(mockRepo.findVersionById).mockResolvedValue(null);

      await expect(useCase.execute("missing-version")).rejects.toThrow(
        PlanVersionNotFoundError,
      );
    });

    it("ArchivePlanVersionUseCase throws PlanVersionNotFoundError for missing version", async () => {
      const useCase = new ArchivePlanVersionUseCase(mockRepo);
      vi.mocked(mockRepo.findVersionById).mockResolvedValue(null);

      await expect(useCase.execute("missing-version")).rejects.toThrow(
        PlanVersionNotFoundError,
      );
    });
  });

  describe("UpdateTenantPlanOverridesUseCase", () => {
    it("throws TenantPlanNotFoundError when tenant plan does not exist", async () => {
      const useCase = new UpdateTenantPlanOverridesUseCase(mockRepo);
      vi.mocked(mockRepo.getTenantPlan).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-missing", { perMinuteRateOverride: 120 }),
      ).rejects.toThrow(TenantPlanNotFoundError);
    });
  });

  describe("ChangeTenantPlanUseCase", () => {
    let useCase: ChangeTenantPlanUseCase;

    beforeEach(() => {
      useCase = new ChangeTenantPlanUseCase(mockRepo);
    });

    it("throws TenantPlanNotFoundError when tenant has no plan", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          newPlanId: "plan-2",
          initiatedBy: "user-1",
        }),
      ).rejects.toThrow(TenantPlanNotFoundError);
    });

    it("throws PlanNotActiveError when tenant current plan is not ACTIVE", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActiveTenantPlan,
        status: "PENDING_PAYMENT",
      });

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          newPlanId: "plan-2",
          initiatedBy: "user-1",
        }),
      ).rejects.toThrow(PlanNotActiveError);
    });

    it("throws PlanNotFoundError when target plan does not exist", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        mockActiveTenantPlan,
      );
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          newPlanId: "plan-missing",
          initiatedBy: "user-1",
        }),
      ).rejects.toThrow(PlanNotFoundError);
    });

    it("throws AppError 403 when user attempts self-service switch to CUSTOM plan", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        mockActiveTenantPlan,
      );
      vi.mocked(mockRepo.findById).mockResolvedValue({
        ...mockPlan,
        id: "plan-custom",
      });
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue({
        ...mockPlanVersion,
        id: "pv-custom",
        pricingModel: "CUSTOM",
      });

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          newPlanId: "plan-custom",
          initiatedBy: "user-1",
          skipOnboardingFeeDiff: false,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "CUSTOM_PLAN_REQUIRES_ADMIN",
      });
    });

    it("throws AppError 400 when attempting to switch to the exact same version", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        mockActiveTenantPlan,
      );
      vi.mocked(mockRepo.findById).mockResolvedValue(mockPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue(
        mockPlanVersion,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          newPlanId: "plan-1",
          initiatedBy: "user-1",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SAME_PLAN_VERSION",
      });
    });

    it("calculates onboarding fee difference and flags requiresPayment = true for UPGRADE", async () => {
      // current plan: displayOrder 2, onboardingFee 50000
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActiveTenantPlan,
        planDisplayOrder: 2,
        onboardingFee: 50000,
      });

      // new plan: displayOrder 3, onboardingFee 120000
      const targetPlan: Plan & { versions: PlanVersion[] } = {
        ...mockPlan,
        id: "plan-enterprise",
        displayOrder: 3,
      };
      const targetVersion: PlanVersion = {
        ...mockPlanVersion,
        id: "pv-enterprise",
        planId: "plan-enterprise",
        onboardingFee: 120000,
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(targetPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue(
        targetVersion,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        newPlanId: "plan-enterprise",
        initiatedBy: "user-1",
      });

      expect(result).toEqual({
        tenantId: "tenant-1",
        previousPlanVersionId: "pv-1",
        newPlanVersionId: "pv-enterprise",
        direction: "UPGRADE",
        onboardingFeeDifference: 70000, // 120000 - 50000
        requiresPayment: true,
        effectiveImmediately: false,
      });
      expect(mockRepo.activatePlan).not.toHaveBeenCalled();
    });

    it("activates immediately without payment for DOWNGRADE or when admin waives fee", async () => {
      // current plan: displayOrder 2, onboardingFee 50000
      const currentExpiry = new Date(Date.now() + 50000000);
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActiveTenantPlan,
        planDisplayOrder: 2,
        onboardingFee: 50000,
        bonusExpiresAt: currentExpiry,
      });

      // target plan: displayOrder 1 (DOWNGRADE)
      const starterPlan: Plan & { versions: PlanVersion[] } = {
        ...mockPlan,
        id: "plan-starter",
        displayOrder: 1,
      };
      const starterVersion: PlanVersion = {
        ...mockPlanVersion,
        id: "pv-starter",
        planId: "plan-starter",
        onboardingFee: 10000,
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(starterPlan);
      vi.mocked(mockRepo.findLatestPublishedVersion).mockResolvedValue(
        starterVersion,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        newPlanId: "plan-starter",
        initiatedBy: "user-1",
      });

      expect(result).toEqual({
        tenantId: "tenant-1",
        previousPlanVersionId: "pv-1",
        newPlanVersionId: "pv-starter",
        direction: "DOWNGRADE",
        onboardingFeeDifference: 0,
        requiresPayment: false,
        effectiveImmediately: true,
      });
      // preserves current bonus expiry
      expect(mockRepo.activatePlan).toHaveBeenCalledWith(
        "tenant-1",
        "pv-starter",
        currentExpiry,
        "user-1",
      );
    });
  });
});
