import { describe, it, expect } from "vitest";
import {
  resolveEffectiveTerms,
  type PlanVersionEntity,
} from "../../../src/modules/plans/domain/entities/plan.entity";

describe("Plan Entity Domain Rules (Module 4 - Commercial Entitlements)", () => {
  const mockPlan = {
    id: "plan-growth-id",
    name: "Growth Plan",
    slug: "growth",
    displayOrder: 2,
  };

  const mockVersion: PlanVersionEntity = {
    id: "ver-1-id",
    planId: "plan-growth-id",
    version: 1,
    status: "PUBLISHED",
    currency: "INR",
    pricingModel: "STANDARD",
    onboardingFee: 99900, // 999.00 INR in paisa
    onboardingFeeOriginal: 149900,
    perMinuteRate: 150, // 1.50 INR / min in paisa
    billingMinimumSec: 30,
    billingIncrementSec: 15,

    maxActiveCampaigns: 5,
    maxLeadsPerBatch: 2000,
    maxAgents: 3,
    maxTeamMembers: 5,
    retryAutomation: true,
    industryPackLimit: 2,

    callingChannel: "SHARED",
    brochureUpload: true,

    dashboardTier: "BASIC",
    agentCapability: "BASIC",
    integrations: "BASIC",
    supportTier: "STANDARD",

    lowBalanceThreshold: 50000,
    includedBalance: 20000,
    bonusValidityDays: 30,

    publishedAt: new Date(),
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("resolves default commercial terms when no overrides are applied", () => {
    const terms = resolveEffectiveTerms(mockPlan, mockVersion);

    expect(terms.planId).toBe(mockPlan.id);
    expect(terms.planName).toBe("Growth Plan");
    expect(terms.version).toBe(1);
    expect(terms.onboardingFee).toBe(99900);
    expect(terms.perMinuteRate).toBe(150);
    expect(terms.billingMinimumSec).toBe(30);
    expect(terms.billingIncrementSec).toBe(15);
    expect(terms.isCustomPriced).toBe(false);

    // Feature quotas preserved
    expect(terms.maxActiveCampaigns).toBe(5);
    expect(terms.maxLeadsPerBatch).toBe(2000);
    expect(terms.maxAgents).toBe(3);
    expect(terms.retryAutomation).toBe(true);
    expect(terms.brochureUpload).toBe(true);
  });

  it("applies perMinuteRateOverride and marks isCustomPriced as true", () => {
    const terms = resolveEffectiveTerms(mockPlan, mockVersion, {
      perMinuteRateOverride: 110, // Discounted to 1.10 INR
    });

    expect(terms.perMinuteRate).toBe(110);
    expect(terms.onboardingFee).toBe(99900); // Unchanged
    expect(terms.isCustomPriced).toBe(true);
  });

  it("applies onboardingFeeOverride and marks isCustomPriced as true", () => {
    const terms = resolveEffectiveTerms(mockPlan, mockVersion, {
      onboardingFeeOverride: 0, // Waived onboarding
    });

    expect(terms.onboardingFee).toBe(0);
    expect(terms.perMinuteRate).toBe(150);
    expect(terms.isCustomPriced).toBe(true);
  });

  it("marks isCustomPriced as true for CUSTOM pricingModel even without explicit overrides", () => {
    const customVersion: PlanVersionEntity = {
      ...mockVersion,
      pricingModel: "CUSTOM",
    };

    const terms = resolveEffectiveTerms(mockPlan, customVersion);
    expect(terms.isCustomPriced).toBe(true);
  });
});
