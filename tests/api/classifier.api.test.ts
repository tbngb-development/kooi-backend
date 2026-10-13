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

// Mock Classifier Client (JEV evaluation)
vi.mock("../../src/shared/config/external/classifier/classifier.client", () => {
  return {
    ClassifierClient: class {
      systemOne = vi.fn().mockResolvedValue({
        model: "jev-latest",
        answers: {
          test_interest: { type: "noul", noul: 0.94 },
        },
        usage: { input_tokens: 150, output_tokens: 35 },
        provider_metadata: { gateway: { cost: "0.00012" } },
      });
    },
  };
});

describe("Classifier Module API (Tenant & Admin) (Module 11)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwt = new JwtTokenService();

  // Test Entities
  const tenantAlphaId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const userAlphaId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const memberAlphaId = "11111111-cccc-4111-8111-cccccccccccc";

  const tenantBetaId = "22222222-aaaa-4222-8222-aaaaaaaaaaaa";
  const userBetaId = "22222222-bbbb-4222-8222-bbbbbbbbbbbb";
  const memberBetaId = "22222222-cccc-4222-8222-cccccccccccc";

  const adminUserId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";

  const industryPackId = "cccccccc-1111-4ccc-8ccc-111111111111";
  const bolnaApiKeyId = "dddddddd-1111-4ddd-8ddd-111111111111";
  const platformAgentId = "eeeeeeee-1111-4eee-8eee-111111111111";

  const callAlphaId = "55555555-1111-4555-8555-111111111111";
  const callBetaId = "55555555-2222-4555-8555-222222222222";

  let tokenAlpha: string;
  let tokenBeta: string;
  let tokenAdmin: string;

  beforeEach(async () => {
    await clearTestDatabase();

    // 1. Create Platform Admin User & Profile
    await prisma.user.create({
      data: {
        id: adminUserId,
        email: "admin@kooi-classifier.com",
        password: "hashed_password",
        name: "Platform Super Admin",
        isActive: true,
        platformAdmin: { create: {} },
      },
    });

    // 2. Create Bolna Key
    await prisma.bolnaApiKey.create({
      data: {
        id: bolnaApiKeyId,
        keyIdentifier: "bolna-key-classifier-test",
        encryptedKey: encryptKey("sk-bolna-classifier-live-mock"),
        type: "GENERAL",
        isPlatformDefault: true,
        isActive: true,
        createdBy: adminUserId,
      },
    });

    // 3. Create Industry Pack
    await prisma.industryPack.create({
      data: {
        id: industryPackId,
        slug: "real-estate-pack",
        name: "Real Estate Industry Pack",
        isActive: true,
      },
    });

    // 4. Create Platform Agent
    await prisma.platformAgent.create({
      data: {
        id: platformAgentId,
        bolnaId: "bolna-agent-classifier-test",
        slug: "real-estate-advisor",
        name: "Real Estate AI Advisor",
        gender: "FEMALE",
        welcomeMessage: "Hello, calling regarding your real estate inquiry.",
        systemPrompt: "You are a professional real estate sales qualifier.",
        requiredVariables: [],
        defaultConfig: {},
        isActive: true,
        bolnaApiKeyId,
        industryPackId,
      },
    });

    // 5. Create Tenant Alpha & User Alpha (Owner)
    await prisma.tenant.create({
      data: {
        id: tenantAlphaId,
        name: "Tenant Alpha Corp",
        email: "alpha@classifier-test.com",
        isActive: true,
        bolnaApiKeyId,
      },
    });

    await prisma.user.create({
      data: {
        id: userAlphaId,
        email: "owner-alpha@classifier-test.com",
        password: "hashed_password",
        name: "Owner Alpha",
        isActive: true,
      },
    });

    await prisma.tenantUser.create({
      data: {
        id: memberAlphaId,
        tenantId: tenantAlphaId,
        userId: userAlphaId,
        role: "OWNER",
      },
    });

    // 6. Create Tenant Beta & User Beta (Owner)
    await prisma.tenant.create({
      data: {
        id: tenantBetaId,
        name: "Tenant Beta Corp",
        email: "beta@classifier-test.com",
        isActive: true,
        bolnaApiKeyId,
      },
    });

    await prisma.user.create({
      data: {
        id: userBetaId,
        email: "owner-beta@classifier-test.com",
        password: "hashed_password",
        name: "Owner Beta",
        isActive: true,
      },
    });

    await prisma.tenantUser.create({
      data: {
        id: memberBetaId,
        tenantId: tenantBetaId,
        userId: userBetaId,
        role: "OWNER",
      },
    });

    // 7. Seed Assistant, Campaign, Batch, Call for Tenant Alpha
    const assistantAlphaId = "aaaa1111-1111-4aaa-8aaa-111111111111";
    await prisma.assistant.create({
      data: {
        id: assistantAlphaId,
        name: "Alpha Property Qualifier",
        tenantId: tenantAlphaId,
        platformAgentId,
        config: {},
      },
    });

    const campaignAlphaId = "cccc1111-1111-4ccc-8ccc-111111111111";
    await prisma.campaign.create({
      data: {
        id: campaignAlphaId,
        name: "Alpha Summer Properties",
        tenantId: tenantAlphaId,
        assistantId: assistantAlphaId,
        status: "RUNNING",
      },
    });

    const batchAlphaId = "bbbb1111-1111-4bbb-8bbb-111111111111";
    await prisma.leadBatch.create({
      data: {
        id: batchAlphaId,
        tenantId: tenantAlphaId,
        campaignId: campaignAlphaId,
        fileName: "leads-alpha.csv",
        status: "RUNNING",
      },
    });

    const leadAlphaId = "dddd1111-1111-4ddd-8ddd-111111111111";
    await prisma.lead.create({
      data: {
        id: leadAlphaId,
        tenantId: tenantAlphaId,
        campaignId: campaignAlphaId,
        batchId: batchAlphaId,
        phone: "+919876543210",
        name: "Aarav Sharma",
        status: "CALLED",
      },
    });

    await prisma.call.create({
      data: {
        id: callAlphaId,
        tenantId: tenantAlphaId,
        campaignId: campaignAlphaId,
        batchId: batchAlphaId,
        leadId: leadAlphaId,
        status: "COMPLETED",
        duration: 85,
        billableSeconds: 120,
        chargedAmount: 300,
        bolnaCallId: "bolna-call-alpha-1",
        transcript: "Customer: I want a 3 BHK in Bangalore.\nAgent: Great, let me share details.",
      },
    });

    // Seed Classifier Call Result for Call Alpha
    await prisma.classifierCallResult.create({
      data: {
        callId: callAlphaId,
        tenantId: tenantAlphaId,
        campaignId: campaignAlphaId,
        batchId: batchAlphaId,
        status: "COMPLETED",
        dispositionCount: 1,
        transcriptLength: 75,
        results: {
          budget_check: {
            value: "QUALIFIED",
            confidence: 0.95,
            questionType: "BOOLEAN",
          },
        },
        inputTokens: 120,
        outputTokens: 40,
        gatewayCost: "0.0001",
        processedAt: new Date(),
      },
    });

    // 8. Seed Assistant, Campaign, Batch, Call for Tenant Beta
    const assistantBetaId = "aaaa2222-2222-4aaa-8aaa-222222222222";
    await prisma.assistant.create({
      data: {
        id: assistantBetaId,
        name: "Beta Commercial Qualifier",
        tenantId: tenantBetaId,
        platformAgentId,
        config: {},
      },
    });

    const campaignBetaId = "cccc2222-2222-4ccc-8ccc-222222222222";
    await prisma.campaign.create({
      data: {
        id: campaignBetaId,
        name: "Beta Offices",
        tenantId: tenantBetaId,
        assistantId: assistantBetaId,
        status: "RUNNING",
      },
    });

    const batchBetaId = "bbbb2222-2222-4bbb-8bbb-222222222222";
    await prisma.leadBatch.create({
      data: {
        id: batchBetaId,
        tenantId: tenantBetaId,
        campaignId: campaignBetaId,
        fileName: "leads-beta.csv",
        status: "RUNNING",
      },
    });

    const leadBetaId = "dddd2222-2222-4ddd-8ddd-222222222222";
    await prisma.lead.create({
      data: {
        id: leadBetaId,
        tenantId: tenantBetaId,
        campaignId: campaignBetaId,
        batchId: batchBetaId,
        phone: "+919876543211",
        name: "Rohit Verma",
        status: "CALLED",
      },
    });

    await prisma.call.create({
      data: {
        id: callBetaId,
        tenantId: tenantBetaId,
        campaignId: campaignBetaId,
        batchId: batchBetaId,
        leadId: leadBetaId,
        status: "COMPLETED",
        duration: 40,
        billableSeconds: 60,
        chargedAmount: 150,
        bolnaCallId: "bolna-call-beta-1",
        transcript: "Customer: Looking for commercial leasing in Mumbai.",
      },
    });

    await prisma.classifierCallResult.create({
      data: {
        callId: callBetaId,
        tenantId: tenantBetaId,
        campaignId: campaignBetaId,
        batchId: batchBetaId,
        status: "COMPLETED",
        dispositionCount: 1,
        transcriptLength: 54,
        results: {
          commercial_intent: {
            value: "HIGH",
            confidence: 0.89,
            questionType: "CHOICE",
          },
        },
        inputTokens: 90,
        outputTokens: 25,
        gatewayCost: "0.00008",
        processedAt: new Date(),
      },
    });

    // 9. Generate Auth Tokens
    tokenAlpha = jwt.generateAccessToken({
      userId: userAlphaId,
      membershipId: memberAlphaId,
      tenantId: tenantAlphaId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });

    tokenBeta = jwt.generateAccessToken({
      userId: userBetaId,
      membershipId: memberBetaId,
      tenantId: tenantBetaId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });

    tokenAdmin = jwt.generateAdminAccessToken(adminUserId);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("Tenant Classifier Results API (/api/v1/classifier)", () => {
    it("GET /api/v1/classifier/results lists classifier results scoped strictly to authenticated tenant", async () => {
      const res = await request(app)
        .get("/api/v1/classifier/results")
        .set("Cookie", [`access_token=${tokenAlpha}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].callId).toBe(callAlphaId);
      expect(res.body.data.items[0].tenantId).toBe(tenantAlphaId);
      expect(res.body.data.items[0].status).toBe("COMPLETED");
    });

    it("GET /api/v1/classifier/results/:callId returns detailed classifier call result for tenant call", async () => {
      const res = await request(app)
        .get(`/api/v1/classifier/results/${callAlphaId}`)
        .set("Cookie", [`access_token=${tokenAlpha}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.callId).toBe(callAlphaId);
      expect(res.body.data.results.budget_check.value).toBe("QUALIFIED");
    });

    it("STRICT CROSS-TENANT IDOR: Tenant Beta receives 404 when querying Tenant Alpha's call result", async () => {
      const res = await request(app)
        .get(`/api/v1/classifier/results/${callAlphaId}`)
        .set("Cookie", [`access_token=${tokenBeta}`]); // Tenant Beta attempting IDOR

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("NOT_FOUND");
    });

    it("returns 404 when call result does not exist", async () => {
      const res = await request(app)
        .get("/api/v1/classifier/results/00000000-0000-4000-8000-000000000000")
        .set("Cookie", [`access_token=${tokenAlpha}`]);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Platform Admin Classifier Operations (/api/v1/admin/classifier)", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/admin/classifier/dispositions");
      expect(res.status).toBe(401);
    });

    it("rejects non-platform-admin tenant user requests with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAlpha}`]); // Regular tenant owner

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("POST /api/v1/admin/classifier/dispositions creates a new classifier disposition (201 Created)", async () => {
      const payload = {
        slug: "urgent-buyer",
        name: "Urgent Buyer",
        displayName: "Urgent Buyer",
        question: "Is buyer looking to purchase within 30 days?",
        questionType: "BOOLEAN",
        objectiveOptions: [{ value: "YES", condition: "Ready within 30 days" }],
        industryPackId,
      };

      const res = await request(app)
        .post("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe("urgent-buyer");
      expect(res.body.data.questionType).toBe("BOOLEAN");
    });

    it("POST /api/v1/admin/classifier/dispositions rejects duplicate slug within same industry pack with 409 Conflict", async () => {
      const payload = {
        slug: "urgent-buyer-dup",
        name: "Urgent Buyer Duplicate",
        displayName: "Urgent Buyer Duplicate",
        question: "Is buyer looking to purchase?",
        questionType: "BOOLEAN",
        objectiveOptions: [{ value: "YES", condition: "Ready" }],
        industryPackId,
      };

      // 1. First creation succeeds
      const firstRes = await request(app)
        .post("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send(payload);
      expect(firstRes.status).toBe(201);

      // 2. Duplicate creation fails with 409
      const dupRes = await request(app)
        .post("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send(payload);

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.success).toBe(false);
      expect(dupRes.body.code).toBe("CLASSIFIER_DUPLICATE_SLUG");
    });

    it("GET /api/v1/admin/classifier/dispositions lists dispositions with pagination", async () => {
      const res = await request(app)
        .get("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it("PATCH & DELETE /api/v1/admin/classifier/dispositions/:id updates and deletes disposition", async () => {
      // 1. Create a disposition
      const createRes = await request(app)
        .post("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({
          slug: "temp-budget-range",
          name: "Temporary Budget Range",
          displayName: "Budget Range",
          question: "What is the budget?",
          questionType: "CHOICE",
          objectiveOptions: [
            { value: "Under 50k", condition: "<50k" },
            { value: "Over 50k", condition: ">50k" },
          ],
        });

      const dispositionId = createRes.body.data.id;

      // 2. Update disposition
      const updateRes = await request(app)
        .patch(`/api/v1/admin/classifier/dispositions/${dispositionId}`)
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({ name: "Updated Budget Range" });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe("Updated Budget Range");

      // 3. Delete disposition
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/classifier/dispositions/${dispositionId}`)
        .set("Cookie", [`access_token=${tokenAdmin}`]);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.message).toBe("Classifier disposition deleted successfully");
    });

    it("POST /api/v1/admin/classifier/agents/:agentId/assign links disposition to platform agent", async () => {
      // 1. Create disposition
      const dispRes = await request(app)
        .post("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({
          slug: "agent-assignment-test",
          name: "Agent Assignment Test",
          displayName: "Assignment Test",
          question: "Test question?",
          questionType: "BOOLEAN",
          objectiveOptions: [{ value: "YES", condition: "Yes" }],
        });

      const dispId = dispRes.body.data.id;

      // 2. Assign to agent
      const assignRes = await request(app)
        .post(`/api/v1/admin/classifier/agents/${platformAgentId}/assign`)
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({ classifierDispositionIds: [dispId] });

      expect(assignRes.status).toBe(200);

      // 3. List agent dispositions
      const listRes = await request(app)
        .get(`/api/v1/admin/classifier/agents/${platformAgentId}/dispositions`)
        .set("Cookie", [`access_token=${tokenAdmin}`]);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((d: any) => d.id === dispId)).toBe(true);

      // 4. Remove from agent
      const removeRes = await request(app)
        .post(`/api/v1/admin/classifier/agents/${platformAgentId}/remove`)
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({ classifierDispositionIds: [dispId] });

      expect(removeRes.status).toBe(200);
    });

    it("POST /api/v1/admin/classifier/test tests classifier in Test Lab using custom transcript", async () => {
      // 1. Create disposition
      const dispRes = await request(app)
        .post("/api/v1/admin/classifier/dispositions")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({
          slug: "test-interest",
          name: "Test Interest",
          displayName: "Test Interest",
          question: "Is customer interested in scheduling an appointment?",
          questionType: "BOOLEAN",
          objectiveOptions: [{ value: "YES", condition: "Customer said yes" }],
        });

      const dispId = dispRes.body.data.id;

      // 2. Execute Test Lab evaluation
      const testRes = await request(app)
        .post("/api/v1/admin/classifier/test")
        .set("Cookie", [`access_token=${tokenAdmin}`])
        .send({
          classifierDispositionIds: [dispId],
          transcriptSource: "custom",
          customTranscript: "Prospect: Yes, I would definitely love to schedule an appointment this Friday.",
        });

      expect(testRes.status).toBe(200);
      expect(testRes.body.success).toBe(true);
      expect(testRes.body.data.results["test-interest"]).toEqual(
        expect.objectContaining({
          value: "YES",
          confidence: 0.94,
          questionType: "BOOLEAN",
        }),
      );
      expect(testRes.body.data.usage).toEqual(
        expect.objectContaining({
          inputTokens: 150,
          outputTokens: 35,
          gatewayCost: "0.00012",
        }),
      );
    });

    it("GET /api/v1/admin/classifier/results lists classifier results across tenants for platform admin", async () => {
      const res = await request(app)
        .get("/api/v1/admin/classifier/results")
        .set("Cookie", [`access_token=${tokenAdmin}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Admin sees both Alpha and Beta results
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it("GET /api/v1/admin/classifier/results/:callId allows platform admin to inspect any tenant call result", async () => {
      const resAlpha = await request(app)
        .get(`/api/v1/admin/classifier/results/${callAlphaId}`)
        .set("Cookie", [`access_token=${tokenAdmin}`]);

      expect(resAlpha.status).toBe(200);
      expect(resAlpha.body.data.callId).toBe(callAlphaId);

      const resBeta = await request(app)
        .get(`/api/v1/admin/classifier/results/${callBetaId}`)
        .set("Cookie", [`access_token=${tokenAdmin}`]);

      expect(resBeta.status).toBe(200);
      expect(resBeta.body.data.callId).toBe(callBetaId);
    });
  });
});
