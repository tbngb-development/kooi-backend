// modules/plans/__tests__/trial-plan.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveEffectiveTerms, type PlanVersionEntity } from "../domain/entities/plan.entity";
import { createPlanSchema, createPlanVersionSchema } from "../presentation/plan.schema";
import { TrialContactLimitExceededError, TrialExpiredError } from "../domain/errors/plan.errors";
import { ExpireTrialPlansUseCase } from "../application/use-cases/expire-trial-plans.use-case";
import prisma from "../../../shared/config/database/prisma";
import type { Logger } from "../../../shared/logging/logger.interface";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    tenantPlan: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    tenantPlanEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        tenantPlan: { update: vi.fn().mockResolvedValue({}) },
        tenantPlanEvent: { create: vi.fn().mockResolvedValue({}) },
      }),
    ),
  },
}));

describe("PlanVersion Enhancement for Free Trial Plans", () => {
  describe("Domain Entity & Effective Terms Resolution", () => {
    const basePlan = {
      id: "plan-trial-1",
      name: "Free Trial",
      slug: "free-trial",
      displayOrder: 1,
    };

    const baseTrialVersion: PlanVersionEntity = {
      id: "ver-1",
      planId: "plan-trial-1",
      version: 1,
      currency: "INR",
      pricingModel: "STANDARD",
      onboardingFee: 0,
      onboardingFeeOriginal: null,
      perMinuteRate: 100,
      billingMinimumSec: 30,
      billingIncrementSec: 15,
      isTrial: true,
      contactLimit: 50,
      validityDays: 30,
      maxActiveCampaigns: 5,
      maxLeadsPerBatch: 100,
      maxAgents: 2,
      maxTeamMembers: 3,
      retryAutomation: false,
      industryPackLimit: null,
      callingChannel: "SHARED",
      brochureUpload: false,
      dashboardTier: "BASIC",
      agentCapability: "BASIC",
      integrations: "NONE",
      supportTier: "STANDARD",
      lowBalanceThreshold: 5000,
      includedBalance: 0,
      bonusValidityDays: null,
      status: "PUBLISHED",
      publishedAt: new Date(),
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should resolve effective terms for a trial plan with validity and contact limit", () => {
      const terms = resolveEffectiveTerms(basePlan, baseTrialVersion);

      expect(terms.isTrial).toBe(true);
      expect(terms.validityDays).toBe(30);
      expect(terms.contactLimit).toBe(50);
      expect(terms.onboardingFee).toBe(0);
    });

    it("should resolve effective terms for paid plans without trial limits or expiry", () => {
      const paidPlan = {
        id: "plan-paid-1",
        name: "Pro Growth",
        slug: "pro-growth",
        displayOrder: 2,
      };

      const paidVersion: PlanVersionEntity = {
        ...baseTrialVersion,
        id: "ver-2",
        planId: "plan-paid-1",
        isTrial: false,
        contactLimit: null,
        validityDays: null,
        onboardingFee: 499900,
      };

      const terms = resolveEffectiveTerms(paidPlan, paidVersion);

      expect(terms.isTrial).toBe(false);
      expect(terms.validityDays).toBeNull();
      expect(terms.contactLimit).toBeNull();
      expect(terms.onboardingFee).toBe(499900);
    });
  });

  describe("Presentation Layer Zod Schema Transformations", () => {
    it("should transform trial plan input by defaulting validityDays to 30 and zeroing onboardingFee", () => {
      const input = {
        name: "Free Trial Plan",
        slug: "free-trial-plan",
        displayOrder: 1,
        isTrial: true,
        contactLimit: 100,
        onboardingFee: 50000, // Should be forced to 0
        perMinuteRate: 100,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      };

      const parsed = createPlanSchema.parse(input);

      expect(parsed.isTrial).toBe(true);
      expect(parsed.validityDays).toBe(30); // Default applied
      expect(parsed.onboardingFee).toBe(0); // Zeroed out
      expect(parsed.contactLimit).toBe(100);
    });

    it("should lock validityDays and contactLimit to null for paid plans", () => {
      const input = {
        name: "Enterprise Paid",
        slug: "enterprise-paid",
        displayOrder: 2,
        isTrial: false,
        validityDays: 60, // Should be nullified for paid plans
        contactLimit: 500, // Should be nullified for paid plans
        onboardingFee: 250000,
        perMinuteRate: 80,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      };

      const parsed = createPlanSchema.parse(input);

      expect(parsed.isTrial).toBe(false);
      expect(parsed.validityDays).toBeNull();
      expect(parsed.contactLimit).toBeNull();
      expect(parsed.onboardingFee).toBe(250000);
    });

    it("should allow unlimited contacts on trial plan when contactLimit is null", () => {
      const input = {
        name: "Unlimited Trial",
        slug: "unlimited-trial",
        displayOrder: 3,
        isTrial: true,
        contactLimit: null,
        validityDays: 14,
        onboardingFee: 0,
        perMinuteRate: 100,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      };

      const parsed = createPlanSchema.parse(input);

      expect(parsed.isTrial).toBe(true);
      expect(parsed.validityDays).toBe(14);
      expect(parsed.contactLimit).toBeNull();
    });

    it("should transform plan version input similarly for new version creation", () => {
      const versionInput = {
        isTrial: true,
        validityDays: null,
        contactLimit: 250,
        onboardingFee: 1000,
        perMinuteRate: 90,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
      };

      const parsed = createPlanVersionSchema.parse(versionInput);

      expect(parsed.isTrial).toBe(true);
      expect(parsed.validityDays).toBe(30);
      expect(parsed.onboardingFee).toBe(0);
      expect(parsed.contactLimit).toBe(250);
    });
  });

  describe("Domain Errors & Limit Rejection", () => {
    it("should format TrialContactLimitExceededError with accurate allowance breakdown", () => {
      const error = new TrialContactLimitExceededError(50, 40, 20);

      expect(error.code).toBe("TRIAL_CONTACT_LIMIT_EXCEEDED");
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("40 of 50 contacts used");
      expect(error.message).toContain("10 remaining contact allowance");
      expect(error.message).toContain("20 valid lead(s)");
      expect(error.message).toContain("Trial contact limit exceeded");
    });

    it("should format TrialExpiredError with clear read-only message", () => {
      const error = new TrialExpiredError();

      expect(error.code).toBe("TRIAL_EXPIRED");
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain("Your free trial has expired");
      expect(error.message).toContain("Historical campaigns, call logs, and data remain accessible");
    });
  });

  describe("ExpireTrialPlansUseCase (Automated Expiry)", () => {
    let mockLogger: Partial<Logger>;
    let useCase: ExpireTrialPlansUseCase;

    beforeEach(() => {
      vi.clearAllMocks();
      mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      useCase = new ExpireTrialPlansUseCase(mockLogger as Logger);
    });

    it("should query overdue active trial plans and expire them in transaction", async () => {
      const overdueDate = new Date(Date.now() - 3600000);
      vi.mocked(prisma.tenantPlan.findMany).mockResolvedValue([
        {
          id: "tp-1",
          tenantId: "tenant-1",
          planVersionId: "ver-1",
          expiresAt: overdueDate,
        } as any,
        {
          id: "tp-2",
          tenantId: "tenant-2",
          planVersionId: "ver-1",
          expiresAt: overdueDate,
        } as any,
      ]);

      const count = await useCase.execute();

      expect(count).toBe(2);
      expect(prisma.tenantPlan.findMany).toHaveBeenCalledWith({
        where: {
          status: "ACTIVE",
          expiresAt: { lte: expect.any(Date) },
        },
        select: {
          id: true,
          tenantId: true,
          planVersionId: true,
          expiresAt: true,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Expired overdue trial plans",
        expect.objectContaining({ expiredCount: 2 }),
      );
    });

    it("should return 0 when no overdue trial plans are found", async () => {
      vi.mocked(prisma.tenantPlan.findMany).mockResolvedValue([]);

      const count = await useCase.execute();

      expect(count).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
