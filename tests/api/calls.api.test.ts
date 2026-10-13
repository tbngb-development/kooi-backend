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

// Mock Bolna Client for syncBolna
vi.mock("../../src/shared/config/external/bolna/bolna.client", () => {
  return {
    BolnaClient: class {
      executions = {
        get: vi.fn().mockResolvedValue({
          id: "bolna-call-alpha-1",
          status: "completed",
          conversation_duration: 80,
          total_cost: 0.08,
          recording_url: "https://recordings.bolna.ai/sync-call.mp3",
          transcript: "Agent: Hello\nUser: Yes I am interested",
          messages: [
            { role: "agent", content: "Hello" },
            { role: "user", content: "Yes I am interested" },
          ],
          extracted_data: {
            budget: "90 Lakhs",
          },
        }),
      };
      batches = {
        create: vi.fn().mockResolvedValue({ batch_id: "mock-batch" }),
      };
      agents = {
        verify: vi.fn().mockResolvedValue({ agent_name: "Mock" }),
      };
      me = {
        get: vi.fn().mockResolvedValue({ wallet_balance: 1000 }),
      };
    },
  };
});

describe("Calls Module API (Tenant & Admin)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwtService = new JwtTokenService();

  // Test RFC UUIDs
  const tenantAId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const userAOwnerId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const memberAOwnerId = "11111111-cccc-4111-8111-cccccccccccc";

  const userAUserId = "11111111-dddd-4111-8111-dddddddddddd";
  const memberAUserId = "11111111-eeee-4111-8111-eeeeeeeeeeee";

  const tenantBId = "22222222-aaaa-4222-8222-aaaaaaaaaaaa";
  const userBOwnerId = "22222222-bbbb-4222-8222-bbbbbbbbbbbb";
  const memberBOwnerId = "22222222-cccc-4222-8222-cccccccccccc";

  const platformAdminId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";

  const sharedApiKeyId = "aaaaaaaa-0000-4aaa-8aaa-000000000000";
  const platformAgentId = "aaaaaaaa-1111-4aaa-8aaa-111111111111";

  const assistantAId = "bbbbbbbb-1111-4bbb-8bbb-111111111111";
  const assistantBId = "bbbbbbbb-2222-4bbb-8bbb-222222222222";

  const campaignAId = "cccccccc-1111-4ccc-8ccc-111111111111";
  const campaignBId = "cccccccc-2222-4ccc-8ccc-222222222222";

  const planId = "dddddddd-1111-4ddd-8ddd-111111111111";
  const planVersionId = "dddddddd-2222-4ddd-8ddd-222222222222";
  const tenantPlanAId = "dddddddd-3333-4ddd-8ddd-333333333333";

  const batchAId = "33333333-1111-4333-8333-111111111111";
  const leadA1Id = "44444444-1111-4444-8444-111111111111";
  const leadA2Id = "44444444-2222-4444-8444-222222222222";

  const callA1Id = "55555555-1111-4555-8555-111111111111"; // COMPLETED
  const callA2Id = "55555555-2222-4555-8555-222222222222"; // FAILED
  const callAArchivedId = "55555555-3333-4555-8555-333333333333"; // isDeleted: true

  const callBId = "55555555-4444-4555-8555-444444444444"; // Tenant B

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
      userId: userAUserId,
      membershipId: memberAUserId,
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

    // 3. Seed Plan & Published Version
    await prisma.plan.create({
      data: {
        id: planId,
        name: "Growth Plan",
        slug: "growth-plan",
        versions: {
          create: {
            id: planVersionId,
            version: 1,
            status: "PUBLISHED",
            onboardingFee: 0,
            perMinuteRate: 150,
            billingMinimumSec: 30,
            billingIncrementSec: 30,
            currency: "INR",
          },
        },
      },
    });

    // 4. Seed Tenants
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: "Tenant Alpha",
        email: "alpha@example.com",
        isActive: true,
        bolnaApiKey: { connect: { id: sharedApiKeyId } },
      },
    });

    await prisma.wallet.create({
      data: {
        tenantId: tenantAId,
        cashBalance: 50000,
        bonusBalance: 5000,
        currency: "INR",
      },
    });

    await prisma.tenantPlan.create({
      data: {
        id: tenantPlanAId,
        tenantId: tenantAId,
        planId,
        planVersionId,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });

    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: "Tenant Beta",
        email: "beta@example.com",
        isActive: true,
        bolnaApiKey: { connect: { id: sharedApiKeyId } },
      },
    });

    // 5. Seed Users & Memberships
    await prisma.user.create({
      data: {
        id: userAOwnerId,
        name: "Alpha Owner",
        email: "alpha-owner@example.com",
        password: "hashed-pwd",
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
        id: userAUserId,
        name: "Alpha User",
        email: "alpha-user@example.com",
        password: "hashed-pwd",
        isActive: true,
        memberships: {
          create: {
            id: memberAUserId,
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
        password: "hashed-pwd",
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

    // 6. Seed Platform Agent
    await prisma.platformAgent.create({
      data: {
        id: platformAgentId,
        bolnaId: "bolna-agent-template-1",
        name: "Inbound Real Estate Agent",
        slug: "inbound-real-estate-agent",
        gender: "FEMALE",
        welcomeMessage: "Hello {customer_name}.",
        systemPrompt: "You are an assistant.",
        requiredVariables: [],
        defaultConfig: {},
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    // 7. Seed Assistants
    await prisma.assistant.create({
      data: {
        id: assistantAId,
        tenantId: tenantAId,
        platformAgentId,
        name: "Alpha Assistant",
        config: {},
      },
    });

    await prisma.assistant.create({
      data: {
        id: assistantBId,
        tenantId: tenantBId,
        platformAgentId,
        name: "Beta Assistant",
        config: {},
      },
    });

    // 8. Seed Campaigns
    await prisma.campaign.create({
      data: {
        id: campaignAId,
        tenantId: tenantAId,
        assistantId: assistantAId,
        name: "Alpha Sales Campaign",
        status: "RUNNING",
      },
    });

    await prisma.campaign.create({
      data: {
        id: campaignBId,
        tenantId: tenantBId,
        assistantId: assistantBId,
        name: "Beta Outreach Campaign",
        status: "RUNNING",
      },
    });

    // 9. Seed LeadBatch
    await prisma.leadBatch.create({
      data: {
        id: batchAId,
        tenantId: tenantAId,
        campaignId: campaignAId,
        bolnaBatchId: "bolna-batch-a1",
        fileName: "batch-a1.csv",
        status: "RUNNING",
      },
    });

    // 10. Seed Leads
    await prisma.lead.create({
      data: {
        id: leadA1Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        batchId: batchAId,
        phone: "+919876500001",
        name: "Alice Johnson",
        status: "CALLED",
      },
    });

    await prisma.lead.create({
      data: {
        id: leadA2Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        batchId: batchAId,
        phone: "+919876500002",
        name: "Bob Smith",
        status: "FAILED",
      },
    });

    // 11. Seed Calls for Tenant A
    await prisma.call.create({
      data: {
        id: callA1Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        leadId: leadA1Id,
        batchId: batchAId,
        bolnaCallId: "bolna-call-alpha-1",
        status: "COMPLETED",
        duration: 90,
        cost: 0.1,
        platformCost: 225,
        billableSeconds: 90,
        recording: "https://recordings.bolna.ai/call-a1.mp3",
        transcript: "assistant: Hello Alice\nuser: I am interested",
        transcriptMessages: [
          { role: "assistant", message: "Hello Alice", time: null },
          { role: "user", message: "I am interested", time: null },
        ],
        summary: "Lead interested in 3BHK",
        isDeleted: false,
      },
    });

    await prisma.call.create({
      data: {
        id: callA2Id,
        tenantId: tenantAId,
        campaignId: campaignAId,
        leadId: leadA2Id,
        batchId: batchAId,
        bolnaCallId: "bolna-call-alpha-2",
        status: "FAILED",
        duration: 0,
        isDeleted: false,
      },
    });

    await prisma.call.create({
      data: {
        id: callAArchivedId,
        tenantId: tenantAId,
        campaignId: campaignAId,
        leadId: leadA1Id,
        batchId: batchAId,
        bolnaCallId: "bolna-call-alpha-archived",
        status: "COMPLETED",
        duration: 40,
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // 12. Seed Call for Tenant B
    await prisma.call.create({
      data: {
        id: callBId,
        tenantId: tenantBId,
        campaignId: campaignBId,
        leadId: leadA1Id, // cross tenant
        bolnaCallId: "bolna-call-beta-1",
        status: "COMPLETED",
        duration: 50,
        isDeleted: false,
      },
    });
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  describe("Tenant Call API (/api/v1/calls)", () => {
    it("GET /api/v1/calls - lists active calls for tenant with pagination and overview", async () => {
      const res = await request(app)
        .get("/api/v1/calls")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.calls).toHaveLength(2); // callA1 and callA2 (excluding archived)
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.overview).toBeDefined();
    });

    it("GET /api/v1/calls - filters calls by status", async () => {
      const res = await request(app)
        .get("/api/v1/calls?status=COMPLETED")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.calls).toHaveLength(1);
      expect(res.body.data.calls[0].id).toBe(callA1Id);
    });

    it("GET /api/v1/calls/stats - returns aggregated stats for tenant", async () => {
      const res = await request(app)
        .get("/api/v1/calls/stats")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.completed).toBe(1);
      expect(res.body.data.failed).toBe(1);
    });

    it("GET /api/v1/calls/:id - returns detailed call record including lead and campaign", async () => {
      const res = await request(app)
        .get(`/api/v1/calls/${callA1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(callA1Id);
      expect(res.body.data.lead.name).toBe("Alice Johnson");
      expect(res.body.data.campaign.name).toBe("Alpha Sales Campaign");
    });

    it("GET /api/v1/calls/:id/transcript - returns transcript, recording, and messages", async () => {
      const res = await request(app)
        .get(`/api/v1/calls/${callA1Id}/transcript`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recording).toBe("https://recordings.bolna.ai/call-a1.mp3");
      expect(res.body.data.transcript).toContain("assistant: Hello Alice");
      expect(res.body.data.summary).toBe("Lead interested in 3BHK");
    });

    it("PATCH /api/v1/calls/:id/archive - OWNER can soft-delete an active call", async () => {
      const res = await request(app)
        .patch(`/api/v1/calls/${callA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const archivedCall = await prisma.call.findUniqueOrThrow({ where: { id: callA1Id } });
      expect(archivedCall.isDeleted).toBe(true);
      expect(archivedCall.deletedAt).not.toBeNull();
    });

    it("PATCH /api/v1/calls/:id/archive - USER role is forbidden (403)", async () => {
      const res = await request(app)
        .patch(`/api/v1/calls/${callA2Id}/archive`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("CROSS-TENANT IDOR: Tenant B cannot access Tenant A's call details (404)", async () => {
      const res = await request(app)
        .get(`/api/v1/calls/${callA1Id}`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });

    it("CROSS-TENANT IDOR: Tenant B cannot archive Tenant A's call (404)", async () => {
      const res = await request(app)
        .patch(`/api/v1/calls/${callA1Id}/archive`)
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });
  });

  describe("Platform Admin Call API (/api/v1/admin/calls)", () => {
    it("GET /api/v1/admin/calls - platform admin can query calls scoping by tenantId", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/calls?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.calls.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/v1/admin/calls - rejects request without tenantId query param (422)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/calls")
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("GET /api/v1/admin/calls - rejects normal tenant user token (403 FORBIDDEN)", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/calls?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("PATCH /api/v1/admin/calls/:id/archive & restore - platform admin can soft delete and restore calls", async () => {
      // 1. Soft delete active call
      const archiveRes = await request(app)
        .patch(`/api/v1/admin/calls/${callA2Id}/archive?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.success).toBe(true);

      const deleted = await prisma.call.findUniqueOrThrow({ where: { id: callA2Id } });
      expect(deleted.isDeleted).toBe(true);

      // 2. Restore deleted call
      const restoreRes = await request(app)
        .patch(`/api/v1/admin/calls/${callA2Id}/restore?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);

      const restored = await prisma.call.findUniqueOrThrow({ where: { id: callA2Id } });
      expect(restored.isDeleted).toBe(false);
      expect(restored.deletedAt).toBeNull();
    });

    it("POST /api/v1/admin/calls/sync-bolna - syncs and updates call from Bolna execution", async () => {
      const res = await request(app)
        .post("/api/v1/admin/calls/sync-bolna")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          callId: callA1Id,
          tenantId: tenantAId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();
    });
  });
});
