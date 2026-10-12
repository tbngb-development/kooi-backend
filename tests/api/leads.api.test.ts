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
        create: vi.fn().mockResolvedValue({ agent_id: "mock-bolna-id-1" }),
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

describe("Lead Ingestion, Deduplication & Management API (Module 8)", () => {
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

  const campaignAId = "cccccccc-1111-4ccc-8ccc-111111111111";
  const campaignBId = "cccccccc-2222-4ccc-8ccc-222222222222";

  const planId = "dddddddd-1111-4ddd-8ddd-111111111111";
  const planVersionId = "dddddddd-2222-4ddd-8ddd-222222222222";
  const tenantPlanId = "dddddddd-3333-4ddd-8ddd-333333333333";

  const leadA1Id = "11111111-1111-4111-8111-111111111111";
  const leadA2Id = "11111111-2222-4111-8111-222222222222";
  const leadAArchivedId = "11111111-3333-4111-8111-333333333333";
  const leadB1Id = "22222222-1111-4222-8222-111111111111";

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
        wallet: {
          create: {
            cashBalance: 50000,
            bonusBalance: 10000,
          },
        },
      },
    });

    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: "Tenant Beta",
        email: "beta@example.com",
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
        wallet: {
          create: {
            cashBalance: 20000,
            bonusBalance: 0,
          },
        },
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
            maxLeadsPerBatch: 100,
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
        welcomeMessage: "Hello {customer_name}.",
        systemPrompt: "CAMPAIGN VARIABLES: {customer_name}",
        requiredVariables: [],
        defaultConfig: { agent_name: "Real Estate Voice Qualifier" },
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    // 7. Seed Assistants for Tenant A and Tenant B
    await prisma.assistant.create({
      data: {
        id: assistantAId,
        name: "Alpha Assistant",
        tenantId: tenantAId,
        platformAgentId: platformAgent1Id,
        config: {},
      },
    });

    await prisma.assistant.create({
      data: {
        id: assistantBId,
        name: "Beta Assistant",
        tenantId: tenantBId,
        platformAgentId: platformAgent1Id,
        config: {},
      },
    });

    // 8. Seed Campaigns
    await prisma.campaign.create({
      data: {
        id: campaignAId,
        name: "Alpha Leads Campaign",
        status: "DRAFT",
        tenantId: tenantAId,
        assistantId: assistantAId,
        isDeleted: false,
      },
    });

    await prisma.campaign.create({
      data: {
        id: campaignBId,
        name: "Beta Leads Campaign",
        status: "DRAFT",
        tenantId: tenantBId,
        assistantId: assistantBId,
        isDeleted: false,
      },
    });

    // 9. Seed Leads for Tenant A and Tenant B
    await prisma.lead.create({
      data: {
        id: leadA1Id,
        name: "Alice Active",
        phone: "+919876543210",
        status: "PENDING",
        tenantId: tenantAId,
        campaignId: campaignAId,
        isDeleted: false,
      },
    });

    await prisma.lead.create({
      data: {
        id: leadA2Id,
        name: "Bob Active",
        phone: "+919876543211",
        status: "CALLED",
        tenantId: tenantAId,
        campaignId: campaignAId,
        isDeleted: false,
      },
    });

    await prisma.lead.create({
      data: {
        id: leadAArchivedId,
        name: "Archived Lead",
        phone: "+919876543212",
        status: "FAILED",
        tenantId: tenantAId,
        campaignId: campaignAId,
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await prisma.lead.create({
      data: {
        id: leadB1Id,
        name: "Beta Lead",
        phone: "+919876543299",
        status: "PENDING",
        tenantId: tenantBId,
        campaignId: campaignBId,
        isDeleted: false,
      },
    });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("Lead Ingestion & File Parsing (/api/v1/campaigns/:id/parse-leads)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-leads`)
        .attach("file", Buffer.from("dummy"), "leads.csv");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 Bad Request when no file is uploaded", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-leads`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("No file uploaded");
    });

    it("returns 404 CampaignNotFoundError when campaign belongs to another tenant (IDOR defense)", async () => {
      const csv = "contact_number,customer_name\n9876543210,Alice\n";
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-leads`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`) // Tenant Beta
        .attach("file", Buffer.from(csv), "leads.csv");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 Bad Request when CSV is missing required contact_number header", async () => {
      const invalidCsv = "name,email,company\nAlice,alice@test.com,Acme\n";
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-leads`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .attach("file", Buffer.from(invalidCsv), "invalid.csv");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Missing required header");
    });

    it("parses valid CSV file, cleans names, identifies duplicates and returns financial estimation", async () => {
      // In the database, Tenant A already has leadA1 with phone +919876543210
      // So 9876543210 will be flagged as dbDuplicate!
      const validCsv = `contact_number,customer_name,company
9876543210,Alice Again,Old Co
9876543215,Dr. Rahul Sharma,Apex Care
9876543215,Rahul Duplicate In File,Apex Care
9876543216,Kmr. Pooja Nair,Edu Corp
`;
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-leads`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .attach("file", Buffer.from(validCsv), "leads.csv");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(4);
      expect(res.body.data.valid).toBe(4);
      expect(res.body.data.inFileDuplicates).toBe(1);
      expect(res.body.data.inFileDuplicateNumbers).toContain("+919876543215");
      expect(res.body.data.dbDuplicates).toBe(1);
      expect(res.body.data.dbDuplicateNumbers).toContain("+919876543210");

      // Ready to import: +919876543215 (first) and +919876543216 = 2 leads
      expect(res.body.data.readyToImport).toBe(2);
      expect(res.body.data.estimation).toBeDefined();
      expect(res.body.data.estimation.currentBalancePaisa).toBe(60000);
      expect(res.body.data.estimation.perMinuteRatePaisa).toBe(60);
    });
  });

  describe("Manual Leads Ingestion (/api/v1/campaigns/:campaignId/parse-manual)", () => {
    it("returns 422 Unprocessable Entity when manual leads array is empty", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-manual`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({ leads: [] });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("parses and deduplicates manual leads payload", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/parse-manual`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          leads: [
            { contact_number: "9876543230", customer_name: "Karan Johar" },
            { contact_number: "9876543231", customer_name: "Zoya Akhtar" },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.readyToImport).toBe(2);
      expect(res.body.data.estimation).toBeDefined();
    });
  });

  describe("Lead Listing & Tenant Isolation (/api/v1/leads)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/leads");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("returns only Tenant Alpha's active leads by default and hides Tenant Beta leads", async () => {
      const res = await request(app)
        .get("/api/v1/leads")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.leads).toBeDefined();

      const leadIds = res.body.data.leads.map((l: any) => l.id);
      expect(leadIds).toContain(leadA1Id);
      expect(leadIds).toContain(leadA2Id);
      expect(leadIds).not.toContain(leadAArchivedId); // Archived hidden by default
      expect(leadIds).not.toContain(leadB1Id); // Tenant Beta lead isolated
    });

    it("GET /api/v1/leads?isDeleted=true returns soft-deleted leads", async () => {
      const res = await request(app)
        .get("/api/v1/leads?isDeleted=true")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const leadIds = res.body.data.leads.map((l: any) => l.id);
      expect(leadIds).toContain(leadAArchivedId);
      expect(leadIds).not.toContain(leadA1Id);
    });

    it("GET /api/v1/leads?status=PENDING filters leads by status", async () => {
      const res = await request(app)
        .get("/api/v1/leads?status=PENDING")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const leadIds = res.body.data.leads.map((l: any) => l.id);
      expect(leadIds).toContain(leadA1Id);
      expect(leadIds).not.toContain(leadA2Id); // Status is CALLED
    });

    it("GET /api/v1/leads/:id returns lead details with campaign info", async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${leadA1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(leadA1Id);
      expect(res.body.data.phone).toBe("+919876543210");
      expect(res.body.data.campaign).toBeDefined();
    });

    it("GET /api/v1/leads/:id enforces strict IDOR protection (returns 404 when Tenant Beta queries Tenant Alpha lead)", async () => {
      const res = await request(app)
        .get(`/api/v1/leads/${leadA1Id}`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/leads/stats returns grouped status counts for tenant", async () => {
      const res = await request(app)
        .get("/api/v1/leads/stats")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.pending).toBeDefined();
    });
  });

  describe("Lead Archival & RBAC (/api/v1/leads/:id/archive - PATCH)", () => {
    it("returns 403 Forbidden when member with role USER attempts to archive lead", async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${leadA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("returns 404 Not Found when Tenant Beta attempts to archive Tenant Alpha lead", async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${leadA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("archives lead successfully when requested by tenant OWNER", async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${leadA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbLead = await prisma.lead.findUnique({
        where: { id: leadA1Id },
      });
      expect(dbLead?.isDeleted).toBe(true);
      expect(dbLead?.deletedAt).not.toBeNull();
    });
  });

  describe("Platform Admin Lead Operations (/api/v1/admin/leads)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get(`/api/v1/admin/leads?tenantId=${tenantAId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects non-admin tenant user with 403 Forbidden", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/leads?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("returns 422 Unprocessable Entity when tenantId query param is missing", async () => {
      const res = await request(app)
        .get("/api/v1/admin/leads")
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/admin/leads returns leads for specified tenant", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/leads?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.leads).toBeDefined();

      const leadIds = res.body.data.leads.map((l: any) => l.id);
      expect(leadIds).toContain(leadA1Id);
      expect(leadIds).not.toContain(leadB1Id);
    });

    it("PATCH /api/v1/admin/leads/:id/restore restores an archived lead", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/leads/${leadAArchivedId}/restore?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbLead = await prisma.lead.findUnique({
        where: { id: leadAArchivedId },
      });
      expect(dbLead?.isDeleted).toBe(false);
      expect(dbLead?.deletedAt).toBeNull();
    });
  });
});
