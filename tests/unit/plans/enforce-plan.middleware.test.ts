import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { EnforcePlanMiddleware } from "../../../src/shared/middleware/enforce-plan";
import type { PlanRepository, TenantActivePlan } from "../../../src/modules/plans/application/interfaces/plan-repository.interface";
import {
  PlanNotActiveError,
  PlanLimitExceededError,
  PlanFeatureNotAvailableError,
  TenantPlanNotFoundError,
} from "../../../src/modules/plans/domain/errors/plan.errors";
import { UnauthorizedError } from "../../../src/shared/errors/unauthorized.error";
import { ForbiddenError } from "../../../src/shared/errors/forbidden.error";
import type { AuthRequest } from "../../../src/shared/types";

function createMockPlanRepo(overrides: Partial<PlanRepository> = {}): PlanRepository {
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
    ...overrides,
  };
}

function createActivePlan(overrides: Partial<TenantActivePlan> = {}): TenantActivePlan {
  return {
    tenantPlanId: "tp-123",
    tenantId: "tenant-uuid-1",
    status: "ACTIVE",
    activatedAt: new Date(),
    bonusExpiresAt: null,
    planId: "plan-1",
    planName: "Growth Plan",
    planSlug: "growth-plan",
    planDisplayOrder: 2,
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
    dashboardTier: "BASIC",
    agentCapability: "BASIC",
    integrations: "NONE",
    supportTier: "STANDARD",
    lowBalanceThreshold: 5000,
    includedBalance: 0,
    bonusValidityDays: null,
    isCustomPriced: false,
    ...overrides,
  };
}

describe("EnforcePlanMiddleware (Module 4 - Commercial Quotas & Feature Flags)", () => {
  let mockRepo: PlanRepository;
  let middleware: EnforcePlanMiddleware;
  let req: Partial<AuthRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockRepo = createMockPlanRepo();
    middleware = new EnforcePlanMiddleware(mockRepo);
    res = {};
    next = vi.fn();
    req = {
      user: {
        userId: "user-1",
        email: "user@example.com",
        membershipId: "mem-1",
        tenantId: "tenant-uuid-1",
        tenantRole: "OWNER",
        type: "tenant",
        isPlatformAdmin: false,
      },
    };
  });

  describe("Authentication & Tenant Context Guards", () => {
    it("yields UnauthorizedError when request lacks authenticated user", async () => {
      req.user = undefined;
      const handler = middleware.check("CREATE_CAMPAIGN");

      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("yields ForbiddenError when user type is not tenant", async () => {
      req.user = {
        userId: "admin-1",
        email: "admin@kooi.com",
        type: "admin",
        isPlatformAdmin: true,
      };
      const handler = middleware.check("CREATE_CAMPAIGN");

      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe("Tenant Plan Active State Guards", () => {
    it("yields TenantPlanNotFoundError when tenant has no plan record", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(null);
      const handler = middleware.check("CREATE_CAMPAIGN");

      await handler(req as Request, res as Response, next);

      expect(mockRepo.getActivePlanForTenant).toHaveBeenCalledWith("tenant-uuid-1");
      expect(next).toHaveBeenCalledWith(expect.any(TenantPlanNotFoundError));
    });

    it("yields PlanNotActiveError when tenant plan status is PENDING_PAYMENT", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ status: "PENDING_PAYMENT" })
      );
      const handler = middleware.check("CREATE_CAMPAIGN");

      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanNotActiveError));
    });

    it("yields PlanNotActiveError when tenant plan status is EXPIRED", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ status: "EXPIRED" })
      );
      const handler = middleware.check("CREATE_CAMPAIGN");

      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanNotActiveError));
    });
  });

  describe("CREATE_CAMPAIGN Quota Check", () => {
    it("allows campaign creation when active campaign count is under quota", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxActiveCampaigns: 5 })
      );
      vi.mocked(mockRepo.countActiveCampaigns).mockResolvedValue(3);

      const handler = middleware.check("CREATE_CAMPAIGN");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("allows campaign creation when maxActiveCampaigns is null (unlimited)", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxActiveCampaigns: null })
      );

      const handler = middleware.check("CREATE_CAMPAIGN");
      await handler(req as Request, res as Response, next);

      expect(mockRepo.countActiveCampaigns).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects with PlanLimitExceededError when active campaigns reaches quota limit", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxActiveCampaigns: 5 })
      );
      vi.mocked(mockRepo.countActiveCampaigns).mockResolvedValue(5);

      const handler = middleware.check("CREATE_CAMPAIGN");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanLimitExceededError));
      const err = vi.mocked(next).mock.calls[0][0] as unknown as PlanLimitExceededError;
      expect(err.message).toContain("Plan limit reached: max 5 active campaigns allowed");
    });
  });

  describe("RETRY_AUTOMATION Feature Flag Check", () => {
    it("allows retry automation when plan feature is enabled", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ retryAutomation: true })
      );

      const handler = middleware.check("RETRY_AUTOMATION");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("rejects with PlanFeatureNotAvailableError when retry automation is disabled on plan", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ retryAutomation: false })
      );

      const handler = middleware.check("RETRY_AUTOMATION");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanFeatureNotAvailableError));
      const err = vi.mocked(next).mock.calls[0][0] as unknown as PlanFeatureNotAvailableError;
      expect(err.message).toContain("retry automation");
    });
  });

  describe("MAX_AGENTS Quota Check", () => {
    it("allows agent creation when below agent limit", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxAgents: 3 })
      );
      vi.mocked(mockRepo.countAgents).mockResolvedValue(2);

      const handler = middleware.check("MAX_AGENTS");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("rejects with PlanLimitExceededError when agent count reaches limit", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxAgents: 3 })
      );
      vi.mocked(mockRepo.countAgents).mockResolvedValue(3);

      const handler = middleware.check("MAX_AGENTS");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanLimitExceededError));
      const err = vi.mocked(next).mock.calls[0][0] as unknown as PlanLimitExceededError;
      expect(err.message).toContain("Plan limit reached: max 3 agents allowed");
    });

    it("allows agent creation when maxAgents is null (unlimited)", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxAgents: null })
      );

      const handler = middleware.check("MAX_AGENTS");
      await handler(req as Request, res as Response, next);

      expect(mockRepo.countAgents).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("MAX_TEAM_MEMBERS Quota Check", () => {
    it("allows invite when team member count is under limit", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxTeamMembers: 5 })
      );
      vi.mocked(mockRepo.countTeamMembers).mockResolvedValue(4);

      const handler = middleware.check("MAX_TEAM_MEMBERS");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("rejects with PlanLimitExceededError when team members count reaches limit", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ maxTeamMembers: 5 })
      );
      vi.mocked(mockRepo.countTeamMembers).mockResolvedValue(5);

      const handler = middleware.check("MAX_TEAM_MEMBERS");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanLimitExceededError));
      const err = vi.mocked(next).mock.calls[0][0] as unknown as PlanLimitExceededError;
      expect(err.message).toContain("Plan limit reached: max 5 team members allowed");
    });
  });

  describe("BROCHURE_UPLOAD Feature Flag Check", () => {
    it("allows brochure upload when enabled", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ brochureUpload: true })
      );

      const handler = middleware.check("BROCHURE_UPLOAD");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("rejects with PlanFeatureNotAvailableError when brochure upload is disabled", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(
        createActivePlan({ brochureUpload: false })
      );

      const handler = middleware.check("BROCHURE_UPLOAD");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(PlanFeatureNotAvailableError));
      const err = vi.mocked(next).mock.calls[0][0] as unknown as PlanFeatureNotAvailableError;
      expect(err.message).toContain("brochure upload");
    });
  });

  describe("MAX_LEADS_PER_BATCH Pass-Through", () => {
    it("passes through to next() since batch size is verified at payload level", async () => {
      vi.mocked(mockRepo.getActivePlanForTenant).mockResolvedValue(createActivePlan());

      const handler = middleware.check("MAX_LEADS_PER_BATCH");
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
