import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { buildContainer } from "../../src/app/container";
import prisma from "../../src/shared/config/database/prisma";
import { clearTestDatabase, disconnectTestDatabase } from "../setup/db-test-client";
import { JwtTokenService } from "../../src/modules/auth/infrastructure/services/jwt-token.service";

// Hoisted in-memory Redis mock
const { testRedis } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RedisMock = require("ioredis-mock");
  return { testRedis: new RedisMock() };
});

vi.mock("../../src/shared/config/database/redis", () => ({
  default: testRedis,
}));

// Mock Email Service to prevent live email sending
vi.mock("../../src/shared/config/external/email/resend.email", () => ({
  ResendEmailService: class {
    send = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock Bull Queue Factory to prevent real network connections
vi.mock("../../src/shared/config/external/queue/queue.factory", () => ({
  getQueue: vi.fn().mockImplementation((name: string) => ({
    name,
    process: vi.fn(),
    add: vi.fn().mockResolvedValue({ id: "mock-job-1" }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  closeAllQueues: vi.fn().mockResolvedValue(undefined),
}));

// Mock rate limiters as passthroughs for functional test runs
vi.mock("../../src/shared/middleware/rate-limiters", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    loginLimiter: passThrough,
    adminLoginLimiter: passThrough,
    otpRequestLimiter: passThrough,
    otpCooldownLimiter: passThrough,
    registerLimiter: passThrough,
    manualBatchRateLimiter: passThrough,
  };
});

describe("Plans, Plan Versioning & Quotas API (Module 4)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwtService = new JwtTokenService();

  // Test Identifiers (RFC-compliant UUIDs)
  const tenantAId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const userAOwnerId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const memberAOwnerId = "11111111-cccc-4111-8111-cccccccccccc";

  const tenantBId = "22222222-aaaa-4222-8222-aaaaaaaaaaaa";
  const userBOwnerId = "22222222-bbbb-4222-8222-bbbbbbbbbbbb";
  const memberBOwnerId = "22222222-cccc-4222-8222-cccccccccccc";

  const platformAdminId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";

  const starterPlanId = "aaaaaaaa-1111-4aaa-8aaa-111111111111";
  const starterVersion1Id = "aaaaaaaa-1111-4aaa-8aaa-222222222222";

  const growthPlanId = "bbbbbbbb-2222-4bbb-8bbb-111111111111";
  const growthVersion1Id = "bbbbbbbb-2222-4bbb-8bbb-222222222222";

  const enterprisePlanId = "cccccccc-3333-4ccc-8ccc-111111111111";
  const enterpriseVersion1Id = "cccccccc-3333-4ccc-8ccc-222222222222";

  // Auth Tokens
  let tenantAOwnerToken: string;
  let tenantBOwnerToken: string;
  let platformAdminToken: string;

  beforeEach(async () => {
    await clearTestDatabase();

    tenantAOwnerToken = jwtService.generateAccessToken({
      userId: userAOwnerId,
      membershipId: memberAOwnerId,
      tenantId: tenantAId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });

    tenantBOwnerToken = jwtService.generateAccessToken({
      userId: userBOwnerId,
      membershipId: memberBOwnerId,
      tenantId: tenantBId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });

    platformAdminToken = jwtService.generateAdminAccessToken(platformAdminId);

    // 1. Seed Platform Admin User
    await prisma.user.create({
      data: {
        id: platformAdminId,
        name: "Platform Admin",
        email: "admin@kooi.com",
        password: "hashed-admin-password",
        isActive: true,
        platformAdmin: {
          create: {},
        },
      },
    });

    // 2. Seed Tenants & Users
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: "Tenant Alpha",
        email: "alpha@company.io",
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        id: userAOwnerId,
        name: "Alice Owner",
        email: "alpha-owner@example.com",
        password: "hashed-user-password",
        isActive: true,
        memberships: {
          create: {
            id: memberAOwnerId,
            tenantId: tenantAId,
            role: "OWNER",
          },
        },
      },
    });

    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: "Tenant Beta",
        email: "beta@company.io",
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        id: userBOwnerId,
        name: "Bob Owner",
        email: "beta-owner@example.com",
        password: "hashed-user-password",
        isActive: true,
        memberships: {
          create: {
            id: memberBOwnerId,
            tenantId: tenantBId,
            role: "OWNER",
          },
        },
      },
    });

    // 3. Seed Commercial Plans & Versions
    // Starter Plan (displayOrder: 1, 10000 onboarding, 150/min)
    await prisma.plan.create({
      data: {
        id: starterPlanId,
        name: "Starter Plan",
        slug: "starter-plan",
        displayOrder: 1,
        isActive: true,
        description: "Entry-level automated voice tier",
        versions: {
          create: {
            id: starterVersion1Id,
            version: 1,
            status: "PUBLISHED",
            pricingModel: "STANDARD",
            onboardingFee: 10000,
            perMinuteRate: 150,
            billingMinimumSec: 30,
            billingIncrementSec: 15,
            maxActiveCampaigns: 2,
            maxAgents: 1,
            maxTeamMembers: 2,
            retryAutomation: false,
            brochureUpload: false,
            includedBalance: 0,
            bonusValidityDays: null,
            publishedAt: new Date(),
          },
        },
      },
    });

    // Growth Plan (displayOrder: 2, 50000 onboarding, 120/min)
    await prisma.plan.create({
      data: {
        id: growthPlanId,
        name: "Growth Plan",
        slug: "growth-plan",
        displayOrder: 2,
        isActive: true,
        description: "Scale outbound qualification campaigns",
        versions: {
          create: {
            id: growthVersion1Id,
            version: 1,
            status: "PUBLISHED",
            pricingModel: "STANDARD",
            onboardingFee: 50000,
            perMinuteRate: 120,
            billingMinimumSec: 30,
            billingIncrementSec: 15,
            maxActiveCampaigns: 5,
            maxAgents: 3,
            maxTeamMembers: 5,
            retryAutomation: true,
            brochureUpload: true,
            includedBalance: 5000,
            bonusValidityDays: 30,
            publishedAt: new Date(),
          },
        },
      },
    });

    // Enterprise Plan (displayOrder: 3, 150000 onboarding, 90/min, CUSTOM pricingModel)
    await prisma.plan.create({
      data: {
        id: enterprisePlanId,
        name: "Enterprise Plan",
        slug: "enterprise-plan",
        displayOrder: 3,
        isActive: true,
        description: "Dedicated channels & bespoke compliance",
        versions: {
          create: {
            id: enterpriseVersion1Id,
            version: 1,
            status: "PUBLISHED",
            pricingModel: "CUSTOM",
            onboardingFee: 150000,
            perMinuteRate: 90,
            billingMinimumSec: 30,
            billingIncrementSec: 10,
            maxActiveCampaigns: null,
            maxAgents: null,
            maxTeamMembers: null,
            retryAutomation: true,
            brochureUpload: true,
            includedBalance: 20000,
            bonusValidityDays: 60,
            publishedAt: new Date(),
          },
        },
      },
    });

    // 4. Assign Active Growth Plan to Tenant A
    await prisma.tenantPlan.create({
      data: {
        tenantId: tenantAId,
        planId: growthPlanId,
        planVersionId: growthVersion1Id,
        status: "ACTIVE",
        activatedAt: new Date(),
        bonusExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("Tenant Plan Catalogue & Inspection (/api/v1/plans)", () => {
    it("GET /api/v1/plans/available rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/plans/available");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/plans/available returns published plans ordered by displayOrder", async () => {
      const res = await request(app)
        .get("/api/v1/plans/available")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);

      const [p1, p2, p3] = res.body.data;
      expect(p1.slug).toBe("starter-plan");
      expect(p1.currentVersion.onboardingFee).toBe(10000);
      expect(p2.slug).toBe("growth-plan");
      expect(p2.currentVersion.onboardingFee).toBe(50000);
      expect(p3.slug).toBe("enterprise-plan");
      expect(p3.currentVersion.pricingModel).toBe("CUSTOM");
    });

    it("GET /api/v1/plans/mine returns 404 Not Found when tenant has no assigned plan", async () => {
      const res = await request(app)
        .get("/api/v1/plans/mine")
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Active plan for tenant");
    });

    it("GET /api/v1/plans/mine returns active plan terms and effective rates for assigned tenant", async () => {
      const res = await request(app)
        .get("/api/v1/plans/mine")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId).toBe(tenantAId);
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.effectiveTerms.planSlug).toBe("growth-plan");
      expect(res.body.data.effectiveTerms.perMinuteRate).toBe(120);
      expect(res.body.data.effectiveTerms.maxActiveCampaigns).toBe(5);
      expect(res.body.data.effectiveTerms.retryAutomation).toBe(true);
      expect(res.body.data.effectiveTerms.brochureUpload).toBe(true);
    });
  });

  describe("Tenant Plan Self-Selection (/api/v1/plans/:planId/select)", () => {
    it("POST /api/v1/plans/:planId/select allows unonboarded Tenant B to select Starter Plan in PENDING_PAYMENT state", async () => {
      const res = await request(app)
        .post(`/api/v1/plans/${starterPlanId}/select`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId).toBe(tenantBId);
      expect(res.body.data.planId).toBe(starterPlanId);
      expect(res.body.data.status).toBe("PENDING_PAYMENT");

      // Verify in DB
      const dbPlan = await prisma.tenantPlan.findUnique({
        where: { tenantId: tenantBId },
      });
      expect(dbPlan).not.toBeNull();
      expect(dbPlan?.planVersionId).toBe(starterVersion1Id);
      expect(dbPlan?.status).toBe("PENDING_PAYMENT");
    });

    it("POST /api/v1/plans/:planId/select rejects self-selection of Custom/Enterprise plan with 403 Forbidden", async () => {
      const res = await request(app)
        .post(`/api/v1/plans/${enterprisePlanId}/select`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Custom/Enterprise plans cannot be self-selected");
    });

    it("POST /api/v1/plans/:planId/select rejects selection with 409 Conflict when tenant already has an ACTIVE plan", async () => {
      const res = await request(app)
        .post(`/api/v1/plans/${starterPlanId}/select`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Tenant already has an active plan");
    });
  });

  describe("Self-Service Plan Change & Upgrades (/api/v1/plans/change)", () => {
    it("POST /api/v1/plans/change executes immediate DOWNGRADE from Growth to Starter with 0 fee diff", async () => {
      const res = await request(app)
        .post("/api/v1/plans/change")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({ newPlanId: starterPlanId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.direction).toBe("DOWNGRADE");
      expect(res.body.data.onboardingFeeDifference).toBe(0);
      expect(res.body.data.requiresPayment).toBe(false);
      expect(res.body.data.effectiveImmediately).toBe(true);

      // Verify DB was updated
      const updated = await prisma.tenantPlan.findUnique({
        where: { tenantId: tenantAId },
      });
      expect(updated?.planId).toBe(starterPlanId);
      expect(updated?.planVersionId).toBe(starterVersion1Id);
      expect(updated?.status).toBe("ACTIVE");
    });

    it("POST /api/v1/plans/change rejects no-op switch to the current plan version with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/plans/change")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({ newPlanId: growthPlanId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Tenant is already on this plan version");
    });
  });

  describe("Platform Admin Plan Lifecycle (/api/v1/admin/plans)", () => {
    it("rejects non-admin tenant user from admin plan routes with 401/403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/plans")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect([401, 403]).toContain(res.status);
    });

    it("POST /api/v1/admin/plans creates a new commercial plan and draft version 1", async () => {
      const res = await request(app)
        .post("/api/v1/admin/plans")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          name: "Pro Volume Plan",
          slug: "pro-volume-plan",
          displayOrder: 4,
          description: "High concurrency calling pack",
          pricingModel: "VOLUME",
          onboardingFee: 75000,
          perMinuteRate: 105,
          billingMinimumSec: 30,
          billingIncrementSec: 15,
          maxActiveCampaigns: 15,
          maxAgents: 5,
          maxTeamMembers: 10,
          retryAutomation: true,
          brochureUpload: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Pro Volume Plan");
      expect(res.body.data.slug).toBe("pro-volume-plan");
      expect(res.body.data.currentVersion).not.toBeNull();
    });

    it("POST /api/v1/admin/plans/:id/versions creates a new draft version 2 for existing plan", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/plans/${growthPlanId}/versions`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          pricingModel: "STANDARD",
          onboardingFee: 55000,
          perMinuteRate: 110,
          billingMinimumSec: 30,
          billingIncrementSec: 15,
          maxActiveCampaigns: 8,
          retryAutomation: true,
          brochureUpload: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.perMinuteRate).toBe(110);
      expect(res.body.data.onboardingFee).toBe(55000);
    });

    it("POST /api/v1/admin/plans/versions/:versionId/publish publishes draft version", async () => {
      // Create draft version first
      const draft = await prisma.planVersion.create({
        data: {
          planId: starterPlanId,
          version: 2,
          status: "DRAFT",
          pricingModel: "STANDARD",
          onboardingFee: 12000,
          perMinuteRate: 140,
        },
      });

      const res = await request(app)
        .post(`/api/v1/admin/plans/versions/${draft.id}/publish`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(draft.id);
      expect(res.body.data.status).toBe("PUBLISHED");

      // Verify in DB
      const updated = await prisma.planVersion.findUnique({
        where: { id: draft.id },
      });
      expect(updated?.status).toBe("PUBLISHED");
      expect(updated?.publishedAt).not.toBeNull();
    });
  });

  describe("Platform Admin Commercial Overrides & Waived Migration", () => {
    it("PATCH /api/v1/admin/plans/tenants/:tenantId/overrides sets bespoke rate and updates effective terms", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/plans/tenants/${tenantAId}/overrides`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          perMinuteRateOverride: 95,
          onboardingFeeOverride: 25000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overrides.perMinuteRateOverride).toBe(95);
      expect(res.body.data.overrides.onboardingFeeOverride).toBe(25000);
      expect(res.body.data.effectiveTerms.perMinuteRate).toBe(95);
      expect(res.body.data.effectiveTerms.onboardingFee).toBe(25000);

      // Verify Tenant inspecting their own plan sees the override immediately
      const mineRes = await request(app)
        .get("/api/v1/plans/mine")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(mineRes.status).toBe(200);
      expect(mineRes.body.data.effectiveTerms.perMinuteRate).toBe(95);
      expect(mineRes.body.data.effectiveTerms.onboardingFee).toBe(25000);
    });

    it("POST /api/v1/admin/plans/tenants/:tenantId/change-plan with waiveFee: true activates Enterprise plan immediately", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/plans/tenants/${tenantAId}/change-plan`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          newPlanId: enterprisePlanId,
          waiveFee: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.direction).toBe("UPGRADE");
      expect(res.body.data.requiresPayment).toBe(false);
      expect(res.body.data.effectiveImmediately).toBe(true);

      // Verify Tenant A is now actively on Enterprise plan in DB
      const updated = await prisma.tenantPlan.findUnique({
        where: { tenantId: tenantAId },
      });
      expect(updated?.planId).toBe(enterprisePlanId);
      expect(updated?.planVersionId).toBe(enterpriseVersion1Id);
      expect(updated?.status).toBe("ACTIVE");
    });
  });
});
