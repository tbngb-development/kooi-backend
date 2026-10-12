import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { buildContainer } from "../../src/app/container";
import prisma from "../../src/shared/config/database/prisma";
import { clearTestDatabase, disconnectTestDatabase } from "../setup/db-test-client";
import { JwtTokenService } from "../../src/modules/auth/infrastructure/services/jwt-token.service";
import { encryptKey } from "../../src/shared/utils/encryption";

// Hoisted in-memory Redis mock
const { testRedis } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RedisMock = require("ioredis-mock");
  return { testRedis: new RedisMock() };
});

vi.mock("../../src/shared/config/database/redis", () => ({
  default: testRedis,
}));

// Mock Email Service
vi.mock("../../src/shared/config/external/email/resend.email", () => ({
  ResendEmailService: class {
    send = vi.fn().mockResolvedValue(undefined);
  },
}));

// Mock Bull Queue Factory
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

// Mock rate limiters
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

// Mock Bolna Client
vi.mock("../../src/shared/config/external/bolna/bolna.client", () => {
  return {
    BolnaClient: class {
      agents = {
        verify: vi.fn().mockResolvedValue({
          agent_name: "Mock Agent",
          agent_welcome_message: "Hello",
          tasks: [{ task_type: "conversation" }],
        }),
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          agent_id: "mock-bolna-id-1",
        }),
      };
      me = {
        get: vi.fn().mockResolvedValue({
          email: "test@bolna.ai",
          name: "Test Account",
          wallet_balance: 10000,
        }),
      };
    },
  };
});

describe("Campaign Management & Lifecycle API (Module 7)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwtService = new JwtTokenService();

  // Test Identifiers (RFC UUIDs)
  const tenantAId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const userAOwnerId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const memberAOwnerId = "11111111-cccc-4111-8111-cccccccccccc";

  const userARegularId = "11111111-dddd-4111-8111-dddddddddddd";
  const memberARegularId = "11111111-eeee-4111-8111-eeeeeeeeeeee";

  const tenantBId = "22222222-aaaa-4222-8222-aaaaaaaaaaaa";
  const userBOwnerId = "22222222-bbbb-4222-8222-bbbbbbbbbbbb";
  const memberBOwnerId = "22222222-cccc-4222-8222-cccccccccccc";

  const platformAdminId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";

  const sharedApiKeyId = "aaaaaaaa-0000-4aaa-8aaa-000000000000";
  const platformAgent1Id = "aaaaaaaa-1111-4aaa-8aaa-111111111111";

  const assistantAId = "bbbbbbbb-1111-4bbb-8bbb-111111111111";
  const assistantBId = "bbbbbbbb-2222-4bbb-8bbb-222222222222";

  const campaignA1Id = "cccccccc-1111-4ccc-8ccc-111111111111";
  const campaignAArchivedId = "cccccccc-2222-4ccc-8ccc-222222222222";
  const campaignARunningId = "cccccccc-3333-4ccc-8ccc-333333333333";
  const campaignB1Id = "cccccccc-4444-4ccc-8ccc-444444444444";

  const planId = "dddddddd-1111-4ddd-8ddd-111111111111";
  const planVersionId = "dddddddd-2222-4ddd-8ddd-222222222222";
  const tenantPlanId = "dddddddd-3333-4ddd-8ddd-333333333333";

  let tenantAOwnerToken: string;
  let tenantAUserToken: string;
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

    tenantAUserToken = jwtService.generateAccessToken({
      userId: userARegularId,
      membershipId: memberARegularId,
      tenantId: tenantAId,
      tenantRole: "USER",
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

    // 1. Seed Platform Admin
    await prisma.user.create({
      data: {
        id: platformAdminId,
        name: "Platform Admin",
        email: "admin@kooi.com",
        password: "hashed-admin-password",
        isActive: true,
        platformAdmin: { create: {} },
      },
    });

    // 2. Seed Bolna API Key
    await prisma.bolnaApiKey.create({
      data: {
        id: sharedApiKeyId,
        keyIdentifier: "shared-prod-key",
        encryptedKey: encryptKey("dummy-bolna-key-secret"),
        type: "GENERAL",
        isPlatformDefault: true,
        isActive: true,
        createdBy: platformAdminId,
      },
    });

    // 3. Seed Tenants
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: "Tenant Alpha",
        email: "alpha@example.com",
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: "Tenant Beta",
        email: "beta@example.com",
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    // 4. Seed Users and Memberships
    await prisma.user.create({
      data: {
        id: userAOwnerId,
        name: "Alpha Owner",
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

    await prisma.user.create({
      data: {
        id: userARegularId,
        name: "Alpha Regular User",
        email: "alpha-user@example.com",
        password: "hashed-user-password",
        isActive: true,
        memberships: {
          create: {
            id: memberARegularId,
            tenantId: tenantAId,
            role: "USER",
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        id: userBOwnerId,
        name: "Beta Owner",
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

    // 5. Seed Plan and Tenant Subscription for Tenant A
    await prisma.plan.create({
      data: {
        id: planId,
        name: "Professional Plan",
        slug: "professional-plan",
        displayOrder: 1,
        versions: {
          create: {
            id: planVersionId,
            version: 1,
            status: "PUBLISHED",
            pricingModel: "STANDARD",
            onboardingFee: 50000,
            perMinuteRate: 60,
            billingMinimumSec: 30,
            billingIncrementSec: 10,
            maxActiveCampaigns: 5,
            maxAgents: 10,
            maxTeamMembers: 10,
            retryAutomation: true,
            brochureUpload: true,
            includedBalance: 10000,
            bonusValidityDays: 30,
            publishedAt: new Date(),
          },
        },
      },
    });

    await prisma.tenantPlan.create({
      data: {
        id: tenantPlanId,
        tenantId: tenantAId,
        planId,
        planVersionId,
        status: "ACTIVE",
        activatedAt: new Date(),
        bonusExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 6. Seed Platform Agent
    await prisma.platformAgent.create({
      data: {
        id: platformAgent1Id,
        bolnaId: "11111111-9999-4111-8111-999999999999",
        name: "Real Estate Voice Qualifier",
        slug: "real-estate-voice-qualifier",
        gender: "FEMALE",
        welcomeMessage: "Hello {customer_name}, calling from {project_name}.",
        systemPrompt: "CAMPAIGN VARIABLES: {customer_name}, {project_name}",
        requiredVariables: [
          {
            name: "customer_name",
            label: "Customer Name",
            required: true,
            isEditable: true,
            inputType: "text",
            defaultValue: null,
          },
          {
            name: "project_name",
            label: "Project Name",
            required: true,
            isEditable: true,
            inputType: "text",
            defaultValue: "Green Acres",
          },
        ],
        defaultConfig: {
          agent_name: "Real Estate Voice Qualifier",
        },
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    // 7. Seed Assistants for Tenant A and Tenant B
    await prisma.assistant.create({
      data: {
        id: assistantAId,
        name: "Alpha Assistant 1",
        tenantId: tenantAId,
        platformAgentId: platformAgent1Id,
        config: {},
      },
    });

    await prisma.assistant.create({
      data: {
        id: assistantBId,
        name: "Beta Assistant 1",
        tenantId: tenantBId,
        platformAgentId: platformAgent1Id,
        config: {},
      },
    });

    // 8. Seed Campaigns
    // Active Draft Campaign for Tenant A
    await prisma.campaign.create({
      data: {
        id: campaignA1Id,
        name: "Alpha Autumn Outreach",
        description: "Cold leads outreach",
        status: "DRAFT",
        tenantId: tenantAId,
        assistantId: assistantAId,
        variables: {
          customer_name: "John Doe",
          project_name: "Green Acres",
        },
        defaultRetryConfig: {
          enabled: true,
          max_retries: 2,
        },
        isDeleted: false,
      },
    });

    // Running Campaign for Tenant A
    await prisma.campaign.create({
      data: {
        id: campaignARunningId,
        name: "Alpha Live Campaign",
        status: "RUNNING",
        tenantId: tenantAId,
        assistantId: assistantAId,
        isDeleted: false,
        startedAt: new Date(),
      },
    });

    // Archived Campaign for Tenant A
    await prisma.campaign.create({
      data: {
        id: campaignAArchivedId,
        name: "Alpha Old Campaign",
        status: "COMPLETED",
        tenantId: tenantAId,
        assistantId: assistantAId,
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Campaign for Tenant B
    await prisma.campaign.create({
      data: {
        id: campaignB1Id,
        name: "Beta Secret Campaign",
        status: "DRAFT",
        tenantId: tenantBId,
        assistantId: assistantBId,
        isDeleted: false,
      },
    });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("Authentication & Tenant Isolation Boundary (/api/v1/campaigns)", () => {
    it("GET /api/v1/campaigns rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/campaigns");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/campaigns returns only Tenant A's non-deleted campaigns by default", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();

      const items = res.body.data.items;
      // Should include campaignA1Id and campaignARunningId, but NOT campaignAArchivedId or campaignB1Id
      const campaignIds = items.map((c: any) => c.id);
      expect(campaignIds).toContain(campaignA1Id);
      expect(campaignIds).toContain(campaignARunningId);
      expect(campaignIds).not.toContain(campaignAArchivedId);
      expect(campaignIds).not.toContain(campaignB1Id);
    });

    it("GET /api/v1/campaigns?isDeleted=true returns soft-deleted campaigns for tenant", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns?isDeleted=true")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      const campaignIds = items.map((c: any) => c.id);
      expect(campaignIds).toContain(campaignAArchivedId);
      expect(campaignIds).not.toContain(campaignA1Id);
    });

    it("GET /api/v1/campaigns/:id returns campaign details for owner tenant", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignA1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(campaignA1Id);
      expect(res.body.data.name).toBe("Alpha Autumn Outreach");
      expect(res.body.data.overview).toBeDefined();
    });

    it("GET /api/v1/campaigns/:id enforces strict IDOR protection (returns 404 when Tenant B queries Tenant A)", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignA1Id}`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/campaigns/:id/stats returns stats breakdown for tenant campaign", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignA1Id}/stats`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.campaign).toBeDefined();
      expect(res.body.data.campaign.id).toBe(campaignA1Id);
      expect(res.body.data.leads).toBeDefined();
      expect(res.body.data.calls).toBeDefined();
    });
  });

  describe("Campaign Creation (/api/v1/campaigns - POST)", () => {
    it("rejects invalid request payload with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          name: "", // empty name
          assistantId: "not-a-uuid",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("returns 404 CampaignAssistantNotFoundError when assistant does not belong to tenant", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          name: "Invalid Assistant Campaign",
          assistantId: assistantBId, // Belongs to Tenant Beta
          variables: { customer_name: "Bob" },
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("returns 422 MissingRequiredVariablesError when required variable without default is missing", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          name: "Missing Variables Campaign",
          assistantId: assistantAId,
          variables: {}, // missing customer_name (no default)
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("customer_name");
    });

    it("returns 422 RetryConfigNotAllowedError when retry automation is enabled in payload but forbidden by plan", async () => {
      // Create Tenant with Plan having retryAutomation: false
      const noRetryPlanId = "eeeeeeee-1111-4eee-8eee-111111111111";
      const noRetryVersionId = "eeeeeeee-2222-4eee-8eee-222222222222";
      await prisma.plan.create({
        data: {
          id: noRetryPlanId,
          name: "Basic Plan No Retry",
          slug: "basic-no-retry",
          displayOrder: 2,
          versions: {
            create: {
              id: noRetryVersionId,
              version: 1,
              status: "PUBLISHED",
              pricingModel: "STANDARD",
              onboardingFee: 0,
              perMinuteRate: 70,
              billingMinimumSec: 30,
              billingIncrementSec: 10,
              retryAutomation: false, // Disallowed
              publishedAt: new Date(),
            },
          },
        },
      });

      // Update Tenant A to this plan
      await prisma.tenantPlan.update({
        where: { id: tenantPlanId },
        data: {
          planId: noRetryPlanId,
          planVersionId: noRetryVersionId,
        },
      });

      const res = await request(app)
        .post("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          name: "Forbidden Retry Campaign",
          assistantId: assistantAId,
          variables: { customer_name: "Alice" },
          defaultRetryConfig: {
            enabled: true,
            max_retries: 2,
          },
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Retry automation");
    });

    it("creates campaign successfully with 201 Created and applies default variables", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          name: "Spring Lead Drive",
          description: "Targeted outbound for Q2 leads",
          assistantId: assistantAId,
          variables: {
            customer_name: "Jane Smith",
            // project_name omitted -> default "Green Acres" should be applied!
          },
          defaultRetryConfig: {
            enabled: true,
            max_retries: 3,
            retry_on_statuses: ["no-answer", "busy"],
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe("Spring Lead Drive");
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.variables).toEqual({
        customer_name: "Jane Smith",
        project_name: "Green Acres",
      });
      expect(res.body.data.defaultRetryConfig).toEqual(
        expect.objectContaining({
          enabled: true,
          max_retries: 3,
        }),
      );
    });

    it("returns 422 MaxActiveCampaignsReachedError when tenant reaches maxActiveCampaigns quota", async () => {
      // Set active campaigns quota to 2 for Tenant A's plan version
      await prisma.planVersion.update({
        where: { id: planVersionId },
        data: { maxActiveCampaigns: 2 },
      });

      // Tenant A already has 2 active non-deleted campaigns (campaignA1Id and campaignARunningId)
      const res = await request(app)
        .post("/api/v1/campaigns")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          name: "Quota Exceeded Campaign",
          assistantId: assistantAId,
          variables: { customer_name: "Over Quota User" },
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("maximum active campaigns limit");
    });
  });

  describe("Campaign Archival & RBAC Controls (/api/v1/campaigns/:id/archive - PATCH)", () => {
    it("returns 403 Forbidden when a member with role USER attempts to archive a campaign", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("returns 422 CampaignNotArchivableError when attempting to archive a RUNNING campaign", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignARunningId}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Cannot archive campaign in active or non-terminal status");
    });

    it("returns 404 when Tenant Beta tries to archive Tenant Alpha's campaign", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("successfully archives a DRAFT campaign when requested by tenant OWNER", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify campaign is now marked isDeleted: true in database
      const dbCampaign = await prisma.campaign.findUnique({
        where: { id: campaignA1Id },
      });
      expect(dbCampaign?.isDeleted).toBe(true);
      expect(dbCampaign?.deletedAt).not.toBeNull();
    });

    it("returns 409 Conflict when attempting to archive an already archived campaign", async () => {
      // campaignAArchivedId is already archived
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAArchivedId}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("already archived");
    });
  });

  describe("Platform Admin Campaign Management (/api/v1/admin/campaigns)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get(`/api/v1/admin/campaigns?tenantId=${tenantAId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects non-admin tenant user requests with 403 Forbidden", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/campaigns?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 Bad Request when tenantId query param is missing", async () => {
      const res = await request(app)
        .get("/api/v1/admin/campaigns")
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/admin/campaigns returns campaigns for specified tenant", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/campaigns?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();

      const ids = res.body.data.items.map((c: any) => c.id);
      expect(ids).toContain(campaignA1Id);
      expect(ids).not.toContain(campaignB1Id);
    });

    it("PATCH /api/v1/admin/campaigns/:id/status updates campaign status", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/campaigns/${campaignA1Id}/status?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          status: "RUNNING",
          cascadeToBatches: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("RUNNING");

      const dbCampaign = await prisma.campaign.findUnique({
        where: { id: campaignA1Id },
      });
      expect(dbCampaign?.status).toBe("RUNNING");
      expect(dbCampaign?.startedAt).not.toBeNull();
    });

    it("PATCH /api/v1/admin/campaigns/:id updates draft campaign details", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/campaigns/${campaignA1Id}?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          name: "Admin Renamed Campaign",
          description: "Updated description by admin",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Admin Renamed Campaign");

      const dbCampaign = await prisma.campaign.findUnique({
        where: { id: campaignA1Id },
      });
      expect(dbCampaign?.name).toBe("Admin Renamed Campaign");
      expect(dbCampaign?.description).toBe("Updated description by admin");
    });

    it("PATCH /api/v1/admin/campaigns/:id/restore restores an archived campaign", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/campaigns/${campaignAArchivedId}/restore?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbCampaign = await prisma.campaign.findUnique({
        where: { id: campaignAArchivedId },
      });
      expect(dbCampaign?.isDeleted).toBe(false);
      expect(dbCampaign?.deletedAt).toBeNull();
    });
  });
});
