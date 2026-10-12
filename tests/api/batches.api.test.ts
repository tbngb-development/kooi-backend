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
    getJobs: vi.fn().mockResolvedValue([]),
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

// Mock Cloudinary Storage Provider
vi.mock("../../src/shared/config/external/storage/cloudinary.storage", () => ({
  CloudinaryStorageProvider: class {
    uploadBuffer = vi.fn().mockResolvedValue("https://res.cloudinary.com/kooi/raw/upload/test.csv");
  },
}));

// Mock Bolna Client
vi.mock("../../src/shared/config/external/bolna/bolna.client", () => {
  return {
    BolnaClient: class {
      batches = {
        create: vi.fn().mockResolvedValue({ batch_id: "mock-bolna-batch-new" }),
        schedule: vi.fn().mockResolvedValue({ state: "scheduled at 2026-10-15T12:00:00Z" }),
        stop: vi.fn().mockResolvedValue({ message: "stopped" }),
        delete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ id: "mock-bolna-batch-1", status: "completed" }),
        getExecutions: vi.fn().mockResolvedValue([]),
      };
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

describe("Batch Workers & Execution Controls API (Module 9)", () => {
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

  const batchA1Id = "33333333-1111-4333-8333-111111111111"; // CREATED
  const batchA2Id = "33333333-2222-4333-8333-222222222222"; // RUNNING
  const batchA3Id = "33333333-3333-4333-8333-333333333333"; // STOPPED
  const batchAArchivedId = "33333333-4444-4333-8333-444444444444"; // isDeleted: true
  const batchB1Id = "33333333-5555-4333-8333-555555555555"; // Tenant B

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
        tenantId: tenantAId,
        platformAgentId: platformAgent1Id,
        name: "Alpha Voice Assistant",
        config: {},
      },
    });

    await prisma.assistant.create({
      data: {
        id: assistantBId,
        tenantId: tenantBId,
        platformAgentId: platformAgent1Id,
        name: "Beta Voice Assistant",
        config: {},
      },
    });

    // 8. Seed Campaigns
    await prisma.campaign.create({
      data: {
        id: campaignAId,
        tenantId: tenantAId,
        assistantId: assistantAId,
        name: "Alpha Q1 Campaign",
        status: "RUNNING",
        variables: {},
      },
    });

    await prisma.campaign.create({
      data: {
        id: campaignBId,
        tenantId: tenantBId,
        assistantId: assistantBId,
        name: "Beta Outreach Campaign",
        status: "RUNNING",
        variables: {},
      },
    });

    // 9. Seed Batches
    await prisma.leadBatch.create({
      data: {
        id: batchA1Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        status: "CREATED",
        bolnaBatchId: "bolna-batch-a1",
        fileName: "alpha-batch-1.csv",
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
        isDeleted: false,
      },
    });

    await prisma.leadBatch.create({
      data: {
        id: batchA2Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        status: "RUNNING",
        bolnaBatchId: "bolna-batch-a2",
        fileName: "alpha-batch-2.csv",
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
        isDeleted: false,
      },
    });

    await prisma.leadBatch.create({
      data: {
        id: batchA3Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        status: "STOPPED",
        bolnaBatchId: "bolna-batch-a3",
        fileName: "alpha-batch-3.csv",
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
        isDeleted: false,
      },
    });

    // Seed 5 PENDING leads for batch A3 so resume has leads
    for (let i = 1; i <= 5; i++) {
      await prisma.lead.create({
        data: {
          id: `11111111-9999-4111-8111-00000000000${i}`,
          tenantId: tenantAId,
          campaignId: campaignAId,
          batchId: batchA3Id,
          phone: `+91987654320${i}`,
          name: `Pending Lead ${i}`,
          status: "PENDING",
        },
      });
    }

    await prisma.leadBatch.create({
      data: {
        id: batchAArchivedId,
        tenantId: tenantAId,
        campaignId: campaignAId,
        status: "STOPPED",
        bolnaBatchId: "bolna-batch-a-archived",
        fileName: "archived-batch.csv",
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    await prisma.leadBatch.create({
      data: {
        id: batchB1Id,
        tenantId: tenantBId,
        campaignId: campaignBId,
        status: "CREATED",
        bolnaBatchId: "bolna-batch-b1",
        fileName: "beta-batch.csv",
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
        isDeleted: false,
      },
    });
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  // =========================================================================
  // 1. Ingestion & File Upload
  // =========================================================================
  describe("Batch Ingestion & File Upload (/api/v1/campaigns/:campaignId/batches)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/batches`)
        .attach("file", Buffer.from("contact_number,customer_name\n+919876543210,Test\n"), "leads.csv")
        .field("termsAccepted", "true")
        .field("termsVersion", "v1.0");

      expect(res.status).toBe(401);
    });

    it("returns 400 Bad Request when no file is uploaded", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/batches`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .field("termsAccepted", "true")
        .field("termsVersion", "v1.0");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No file uploaded");
    });

    it("returns 422 Unprocessable Entity when termsAccepted is missing or false", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/batches`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .attach("file", Buffer.from("contact_number,customer_name\n+919876543210,Test\n"), "leads.csv")
        .field("termsAccepted", "false")
        .field("termsVersion", "v1.0");

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 CampaignNotFoundError when campaign belongs to another tenant (IDOR defense)", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignBId}/batches`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .attach("file", Buffer.from("contact_number,customer_name\n+919876543210,Test\n"), "leads.csv")
        .field("termsAccepted", "true")
        .field("termsVersion", "v1.0");

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });

    it("enqueues batch processing and returns 201 Created on valid CSV upload", async () => {
      const validCsv = "contact_number,customer_name\n+919876543210,Rohit Sharma\n";

      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/batches`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .attach("file", Buffer.from(validCsv), "leads.csv")
        .field("termsAccepted", "true")
        .field("termsVersion", "v1.0");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PROCESSING");
      expect(res.body.data.batchId).toBeDefined();
    });

    it("enqueues manual leads entry and returns 201 Created", async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignAId}/batches/manual`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`)
        .send({
          termsAccepted: true,
          termsVersion: "v1.0",
          leads: [{ contact_number: "+919876543210", customer_name: "Anita Desai" }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("PROCESSING");
    });
  });

  // =========================================================================
  // 2. Listing & Details
  // =========================================================================
  describe("Batch Listing & Details (/api/v1/campaigns/:campaignId/batches)", () => {
    it("returns active batches for campaign and hides other tenants' batches", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}/batches`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const batchIds = res.body.data.map((b: any) => b.id);
      expect(batchIds).toContain(batchA1Id);
      expect(batchIds).toContain(batchA2Id);
      expect(batchIds).toContain(batchA3Id);
      expect(batchIds).not.toContain(batchAArchivedId);
      expect(batchIds).not.toContain(batchB1Id);
    });

    it("returns archived batches when ?isDeleted=true is requested", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}/batches?isDeleted=true`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      const batchIds = res.body.data.map((b: any) => b.id);
      expect(batchIds).toContain(batchAArchivedId);
      expect(batchIds).not.toContain(batchA1Id);
    });

    it("GET /:batchId returns batch details", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(batchA1Id);
      expect(res.body.data.status).toBe("CREATED");
    });

    it("GET /:batchId enforces strict IDOR protection across tenants", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`); // Tenant B query Tenant A batch

      expect(res.status).toBe(404);
    });

    it("GET /:batchId/stats returns aggregated batch metrics", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}/batches/${batchA2Id}/stats`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.batch.id).toBe(batchA2Id);
      expect(Array.isArray(res.body.data.leads)).toBe(true);
      expect(Array.isArray(res.body.data.calls)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Execution Controls: Run, Schedule, Stop, Resume
  // =========================================================================
  describe("Batch Execution Controls (/api/v1/campaigns/:campaignId/batches/:batchId/*)", () => {
    describe("POST /run", () => {
      it("enforces cross-tenant IDOR protection (returns 404 for foreign tenant)", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}/run`)
          .set("Authorization", `Bearer ${tenantBOwnerToken}`);

        expect(res.status).toBe(404);
      });

      it("returns 422 Unprocessable Entity when batch is already in RUNNING status", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA2Id}/run`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`);

        expect(res.status).toBe(422);
        expect(res.body.code).toBe("BATCH_OPERATION_ERROR");
      });

      it("starts batch run and updates status to RUNNING", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}/run`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.batch.status).toBe("RUNNING");
      });
    });

    describe("POST /schedule", () => {
      it("returns 422 Unprocessable Entity when scheduledAt is missing", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}/schedule`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`)
          .send({});

        expect(res.status).toBe(422);
      });

      it("returns 422 Unprocessable Entity when scheduledAt is in the past", async () => {
        const pastDate = new Date(Date.now() - 3600000).toISOString();
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}/schedule`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`)
          .send({ scheduledAt: pastDate });

        expect(res.status).toBe(422);
        expect(res.body.code).toBe("BATCH_OPERATION_ERROR");
      });

      it("schedules batch for future date and updates status to SCHEDULED", async () => {
        const futureDate = new Date(Date.now() + 3600000).toISOString();
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}/schedule`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`)
          .send({ scheduledAt: futureDate });

        expect(res.status).toBe(200);
        expect(res.body.data.batch.status).toBe("SCHEDULED");
      });
    });

    describe("POST /stop", () => {
      it("halts running batch and sets status to STOPPED", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA2Id}/stop`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe("STOPPED");
      });

      it("returns early with inactive message if batch is already STOPPED", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA3Id}/stop`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.message).toBe("This batch is already inactive.");
      });
    });

    describe("POST /resume", () => {
      it("returns 422 Unprocessable Entity when batch is not in STOPPED status", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}/resume`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`);

        expect(res.status).toBe(422);
        expect(res.body.code).toBe("BATCH_OPERATION_ERROR");
      });

      it("resumes stopped batch with pending leads and creates new batch", async () => {
        const res = await request(app)
          .post(`/api/v1/campaigns/${campaignAId}/batches/${batchA3Id}/resume`)
          .set("Authorization", `Bearer ${tenantAOwnerToken}`);

        expect(res.status).toBe(201);
        expect(res.body.data.remainingLeads).toBe(5);
        expect(res.body.data.newBatch).toBeDefined();
      });
    });
  });

  // =========================================================================
  // 4. Deletion & Archival
  // =========================================================================
  describe("Batch Deletion & Archival (DELETE & PATCH archive)", () => {
    it("returns 403 Forbidden when member with role USER attempts to delete batch", async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 409 Conflict when attempting to delete an active batch (RUNNING)", async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignAId}/batches/${batchA2Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("BATCH_ACTIVE_DELETE");
    });

    it("deletes non-active batch successfully when requested by OWNER", async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignAId}/batches/${batchA1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe("Batch deleted successfully");
    });

    it("returns 403 Forbidden when member with role USER attempts to archive batch", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAId}/batches/${batchA3Id}/archive`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 422 Unprocessable Entity when attempting to archive active batch", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAId}/batches/${batchA2Id}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("BATCH_NOT_ARCHIVABLE");
    });

    it("archives inactive batch successfully when requested by OWNER", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAId}/batches/${batchA3Id}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(batchA3Id);
    });
  });

  // =========================================================================
  // 5. Platform Admin Operations
  // =========================================================================
  describe("Platform Admin Batch Operations (/api/v1/admin/batches)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .get("/api/v1/admin/batches");

      expect(res.status).toBe(401);
    });

    it("rejects non-platform-admin tenant owner with 403 Forbidden", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/batches?tenantId=${tenantAId}&campaignId=${campaignAId}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 400 Bad Request when tenantId query param is missing", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/batches?campaignId=${campaignAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("TENANT_BAD_REQUEST_ERROR");
    });

    it("lists batches for specified tenant and campaign", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/batches?tenantId=${tenantAId}&campaignId=${campaignAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("GET /admin/batches/:id returns batch for specified tenant", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/batches/${batchA1Id}?tenantId=${tenantAId}&campaignId=${campaignAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(batchA1Id);
    });

    it("PATCH /admin/batches/:id/restore restores archived batch", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/batches/${batchAArchivedId}/restore?tenantId=${tenantAId}&campaignId=${campaignAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(batchAArchivedId);
    });
  });
});
