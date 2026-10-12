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

// Mock Bolna Client to prevent live external network calls
vi.mock("../../src/shared/config/external/bolna/bolna.client", () => {
  return {
    BolnaClient: class {
      agents = {
        verify: vi.fn().mockResolvedValue({
          agent_name: "Mock Bolna Agent",
          agent_welcome_message: "Hello from Bolna",
          agent_prompts: {
            task_1: {
              system_prompt: "CAMPAIGN VARIABLES: {customer_name}",
            },
          },
          tasks: [{ task_type: "conversation" }],
        }),
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          agent_id: "mock-new-bolna-id-99",
          agent_name: "Cloned Bolna Agent",
        }),
        delete: vi.fn().mockResolvedValue({ message: "deleted", status: "success" }),
      };
      categories = {
        list: vi.fn().mockResolvedValue([]),
      };
      user = {
        getProfile: vi.fn().mockResolvedValue({
          email: "test@bolna.ai",
          name: "Test Account",
          wallet_balance: 10000,
        }),
      };
    },
  };
});

describe("Assistants, Platform Agents & Cloning API (Module 6)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwtService = new JwtTokenService();

  // Test Identifiers (RFC UUIDs)
  const tenantAId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const userAOwnerId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const memberAOwnerId = "11111111-cccc-4111-8111-cccccccccccc";

  const tenantBId = "22222222-aaaa-4222-8222-aaaaaaaaaaaa";
  const userBOwnerId = "22222222-bbbb-4222-8222-bbbbbbbbbbbb";
  const memberBOwnerId = "22222222-cccc-4222-8222-cccccccccccc";

  const platformAdminId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";

  const sharedApiKeyId = "aaaaaaaa-0000-4aaa-8aaa-000000000000";
  const platformAgent1Id = "aaaaaaaa-1111-4aaa-8aaa-111111111111";
  const platformAgent2Id = "aaaaaaaa-2222-4aaa-8aaa-222222222222";

  const assistantA1Id = "bbbbbbbb-1111-4bbb-8bbb-111111111111";
  const assistantAArchivedId = "bbbbbbbb-2222-4bbb-8bbb-222222222222";
  const assistantB1Id = "bbbbbbbb-3333-4bbb-8bbb-333333333333";

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

    // 1. Seed Platform Admin
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

    // 2. Seed Shared Platform Bolna API Key
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

    // 3. Seed Tenant Alpha & Owner
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: "Tenant Alpha",
        email: "alpha@example.com",
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

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

    // 4. Seed Tenant Beta & Owner
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: "Tenant Beta",
        email: "beta@example.com",
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
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

    // 5. Seed Master Platform Agents
    await prisma.platformAgent.create({
      data: {
        id: platformAgent1Id,
        bolnaId: "bolna-agent-template-1",
        name: "Real Estate Qualifier",
        slug: "real-estate-qualifier",
        gender: "FEMALE",
        welcomeMessage: "Hello {customer_name}, calling about the property.",
        systemPrompt: "CAMPAIGN VARIABLES: {customer_name}, {budget}",
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
            name: "budget",
            label: "Budget",
            required: false,
            isEditable: true,
            inputType: "text",
            defaultValue: "50L",
          },
        ],
        defaultConfig: {
          agent_name: "Real Estate Qualifier",
          agent_welcome_message: "Hello {customer_name}",
        },
        isFeatured: false,
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    await prisma.platformAgent.create({
      data: {
        id: platformAgent2Id,
        bolnaId: "bolna-agent-template-2",
        name: "Automotive Lead Qualifier",
        slug: "automotive-lead-qualifier",
        gender: "MALE",
        welcomeMessage: "Hi {customer_name}, test drive confirmation.",
        systemPrompt: "CAMPAIGN VARIABLES: {customer_name}, {model_name}",
        requiredVariables: [],
        defaultConfig: {
          agent_name: "Automotive Lead Qualifier",
        },
        isFeatured: false,
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    // 6. Seed Assistants for Tenants
    // Active Assistant for Tenant Alpha
    await prisma.assistant.create({
      data: {
        id: assistantA1Id,
        name: "Alpha Real Estate Assistant",
        tenantId: tenantAId,
        platformAgentId: platformAgent1Id,
        config: { agent_name: "Alpha Real Estate Assistant" },
        isDeleted: false,
      },
    });

    // Soft-deleted Assistant for Tenant Alpha
    await prisma.assistant.create({
      data: {
        id: assistantAArchivedId,
        name: "Alpha Archived Assistant",
        tenantId: tenantAId,
        platformAgentId: platformAgent2Id,
        config: { agent_name: "Alpha Archived Assistant" },
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    // Active Assistant for Tenant Beta
    await prisma.assistant.create({
      data: {
        id: assistantB1Id,
        name: "Beta Automotive Assistant",
        tenantId: tenantBId,
        platformAgentId: platformAgent2Id,
        config: { agent_name: "Beta Automotive Assistant" },
        isDeleted: false,
      },
    });
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  describe("Tenant Assistant Operations (/api/v1/assistants)", () => {
    it("GET /api/v1/assistants rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/assistants");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/assistants returns only active assistants for the authenticated tenant (IDOR & soft-delete filtering)", async () => {
      // 1. Tenant Alpha inspection
      const resA = await request(app)
        .get("/api/v1/assistants")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.success).toBe(true);
      expect(Array.isArray(resA.body.data)).toBe(true);
      expect(resA.body.data).toHaveLength(1);
      expect(resA.body.data[0].id).toBe(assistantA1Id);
      expect(resA.body.data[0].tenantId).toBe(tenantAId);
      // Soft-deleted assistant is excluded
      expect(resA.body.data.some((a: any) => a.id === assistantAArchivedId)).toBe(false);

      // 2. Tenant Beta inspection
      const resB = await request(app)
        .get("/api/v1/assistants")
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data).toHaveLength(1);
      expect(resB.body.data[0].id).toBe(assistantB1Id);
      expect(resB.body.data[0].tenantId).toBe(tenantBId);
    });

    it("GET /api/v1/assistants/:id returns assistant details with resolved dynamic variables", async () => {
      const res = await request(app)
        .get(`/api/v1/assistants/${assistantA1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assistant.id).toBe(assistantA1Id);
      expect(res.body.data.assistant.platformAgent.slug).toBe("real-estate-qualifier");
      expect(res.body.data.variables).toEqual([
        {
          key: "customer_name",
          label: "Customer Name",
          required: true,
          isEditable: true,
          inputType: "text",
          defaultValue: null,
        },
        {
          key: "budget",
          label: "Budget",
          required: false,
          isEditable: true,
          inputType: "text",
          defaultValue: "50L",
        },
      ]);
    });

    it("GET /api/v1/assistants/:id enforces strict cross-tenant isolation (404 on IDOR attempt)", async () => {
      // Tenant Alpha attempts to access Tenant Beta's assistant ID
      const res = await request(app)
        .get(`/api/v1/assistants/${assistantB1Id}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Platform Admin Assistant Controls (/api/v1/admin/assistants)", () => {
    it("rejects non-platform-admin tenant users with 401/403", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/assistants?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect([401, 403]).toContain(res.status);
    });

    it("GET /api/v1/admin/assistants lists assistants for a specific tenant", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/assistants?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(assistantA1Id);
    });

    it("POST /api/v1/admin/assistants/register creates assistant for tenant workspace", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/assistants/register?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          name: "New Admin Registered Assistant",
          platformAgentId: platformAgent2Id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("New Admin Registered Assistant");
      expect(res.body.data.tenantId).toBe(tenantAId);

      // Verify in DB
      const dbAssistant = await prisma.assistant.findUnique({
        where: { id: res.body.data.id },
      });
      expect(dbAssistant).not.toBeNull();
      expect(dbAssistant!.name).toBe("New Admin Registered Assistant");
    });

    it("PATCH /api/v1/admin/assistants/:id updates assistant name", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/assistants/${assistantA1Id}?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          name: "Updated Alpha Assistant Name",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Updated Alpha Assistant Name");

      const dbAssistant = await prisma.assistant.findUnique({
        where: { id: assistantA1Id },
      });
      expect(dbAssistant!.name).toBe("Updated Alpha Assistant Name");
    });

    it("DELETE /api/v1/admin/assistants/:id soft-deletes the assistant", async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/assistants/${assistantA1Id}?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbAssistant = await prisma.assistant.findUnique({
        where: { id: assistantA1Id },
      });
      expect(dbAssistant!.isDeleted).toBe(true);
      expect(dbAssistant!.deletedAt).not.toBeNull();
    });

    it("PATCH /api/v1/admin/assistants/:id/restore restores a soft-deleted assistant", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/assistants/${assistantAArchivedId}/restore?tenantId=${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          tenantId: tenantAId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbAssistant = await prisma.assistant.findUnique({
        where: { id: assistantAArchivedId },
      });
      expect(dbAssistant!.isDeleted).toBe(false);
      expect(dbAssistant!.deletedAt).toBeNull();
    });
  });

  describe("Platform Admin Master Agent Blueprints (/api/v1/admin/platform-agents)", () => {
    it("GET /api/v1/admin/platform-agents returns registered master blueprints", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform-agents")
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it("POST /api/v1/admin/platform-agents registers a new master blueprint", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform-agents")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          name: "Healthcare Appointment Qualifier",
          slug: "healthcare-qualifier",
          bolnaId: "11111111-9999-4111-8111-999999999999",
          bolnaApiKeyId: sharedApiKeyId,
          gender: "FEMALE",
          description: "Healthcare appointment booking",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Healthcare Appointment Qualifier");
      expect(res.body.data.slug).toBe("healthcare-qualifier");
    });

    it("POST /api/v1/admin/platform-agents/clone clones agent to target workspace", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform-agents/clone")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          sourcePlatformAgentId: platformAgent1Id,
          targetApiKeyId: sharedApiKeyId,
          newName: "Cloned Solar Agent",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toContain("Cloned Solar Agent");
      expect(res.body.data.bolnaId).toBe("mock-new-bolna-id-99");
    });
  });
});
