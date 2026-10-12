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

// Mock Bolna Client for Extractions Discovery & Sync
vi.mock("../../src/shared/config/external/bolna/bolna.client", () => {
  return {
    BolnaClient: class {
      extractions = {
        listCategories: vi.fn().mockResolvedValue({
          categories: [
            {
              id: "bolna-cat-remote-101",
              name: "Lead Qualification Group",
              model: "gpt-4.1-mini",
              agent_id: "77777777-1111-4777-8777-111111111111",
              created_at: "2026-10-12T00:00:00.000Z",
              updated_at: "2026-10-12T00:00:00.000Z",
              dispositions: [],
            },
          ],
        }),
        listDispositions: vi.fn().mockResolvedValue([
          {
            id: "bolna-disp-remote-201",
            name: "budget_qualification",
            category: "Lead Qualification Group",
            category_id: "bolna-cat-remote-101",
            model: "gpt-4.1-mini",
            is_subjective: false,
            is_objective: true,
            subjective_type: "text",
            subjective_type_config: null,
            objective_options: [
              { value: "Under 50L", condition: "Budget is under 50 Lakhs" },
            ],
            agent_ids: ["77777777-1111-4777-8777-111111111111"],
            created_by: "system",
            created_at: "2026-10-12T00:00:00.000Z",
            updated_at: "2026-10-12T00:00:00.000Z",
          },
        ]),
        createCategory: vi.fn(),
        updateCategory: vi.fn(),
        deleteCategory: vi.fn(),
        createDisposition: vi.fn(),
        updateDisposition: vi.fn(),
        deleteDisposition: vi.fn(),
      };
      agents = {
        verify: vi.fn(),
        list: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      };
      user = {
        getProfile: vi.fn(),
      };
    },
  };
});

describe("Extraction Taxonomy API (Platform Admin) (Module 11)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwt = new JwtTokenService();

  // Test IDs
  const adminUserId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";
  const regularTenantId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const regularUserId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const regularMemberId = "11111111-cccc-4111-8111-cccccccccccc";

  const industryPackId = "cccccccc-1111-4ccc-8ccc-111111111111";
  const industryPackBetaId = "cccccccc-2222-4ccc-8ccc-222222222222";
  const bolnaApiKeyId = "dddddddd-1111-4ddd-8ddd-111111111111";
  const platformAgentId = "77777777-1111-4777-8777-111111111111";

  let tokenAdmin: string;
  let tokenTenantUser: string;

  beforeEach(async () => {
    await clearTestDatabase();

    // 1. Create Platform Admin User
    await prisma.user.create({
      data: {
        id: adminUserId,
        email: "admin@kooi-extractions.com",
        password: "hashed_password",
        name: "Platform Super Admin",
        isActive: true,
        platformAdmin: { create: {} },
      },
    });

    // 2. Create Regular Tenant & User
    await prisma.tenant.create({
      data: {
        id: regularTenantId,
        name: "Acme Regular Corp",
        email: "tenant@acme.com",
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        id: regularUserId,
        email: "user@acme.com",
        password: "hashed_password",
        name: "Regular Tenant User",
        isActive: true,
      },
    });

    await prisma.tenantUser.create({
      data: {
        id: regularMemberId,
        tenantId: regularTenantId,
        userId: regularUserId,
        role: "OWNER",
      },
    });

    // 3. Create Bolna Key
    await prisma.bolnaApiKey.create({
      data: {
        id: bolnaApiKeyId,
        keyIdentifier: "bolna-key-extraction-test",
        encryptedKey: encryptKey("sk-bolna-extraction-mock"),
        type: "GENERAL",
        isPlatformDefault: true,
        isActive: true,
        createdBy: adminUserId,
      },
    });

    // 4. Create Industry Packs
    await prisma.industryPack.create({
      data: {
        id: industryPackId,
        slug: "real-estate-pack",
        name: "Real Estate Industry Pack",
        isActive: true,
      },
    });

    await prisma.industryPack.create({
      data: {
        id: industryPackBetaId,
        slug: "bfsi-pack",
        name: "BFSI Industry Pack",
        isActive: true,
      },
    });

    // 5. Create Platform Agent
    await prisma.platformAgent.create({
      data: {
        id: platformAgentId,
        bolnaId: platformAgentId, // Matching UUID for query schema validation
        slug: "real-estate-advisor",
        name: "Real Estate AI Advisor",
        gender: "FEMALE",
        welcomeMessage: "Hello from agent",
        systemPrompt: "Agent prompt",
        requiredVariables: [],
        defaultConfig: {},
        isActive: true,
        bolnaApiKeyId,
        industryPackId,
      },
    });

    // 6. Generate Tokens
    tokenAdmin = jwt.generateAdminAccessToken(adminUserId);
    tokenTenantUser = jwt.generateAccessToken({
      userId: regularUserId,
      membershipId: regularMemberId,
      tenantId: regularTenantId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("Platform Admin Authentication & RBAC Guards", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/admin/extractions/categories");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("UNAUTHORIZED");
    });

    it("rejects non-platform-admin tenant user requests with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenTenantUser}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("FORBIDDEN");
    });
  });

  describe("Extraction Categories CRUD & Filtering (/api/v1/admin/extractions/categories)", () => {
    it("POST /categories creates a new extraction category (201 Created)", async () => {
      const res = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "Lead Intent & Timeline",
          model: "gpt-4.1-mini",
          description: "Attributes tracking customer purchase timeline and intent",
          industryPackIds: [industryPackId],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Lead Intent & Timeline");
      expect(res.body.data.slug).toBe("lead-intent-timeline");
      expect(res.body.data.model).toBe("gpt-4.1-mini");
      expect(res.body.data.isActive).toBe(true);
    });

    it("POST /categories rejects duplicate name (case-insensitive) with 409 Conflict", async () => {
      // First create
      await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Budget Verification" });

      // Duplicate attempt
      const res = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "budget verification" });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("DUPLICATE_EXTRACTION_CATEGORY_NAME");
    });

    it("GET /categories lists categories with counts and isActive filter", async () => {
      await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Category Active" });

      const res = await request(app)
        .get("/api/v1/admin/extractions/categories?isActive=true")
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).toHaveProperty("_count");
    });

    it("GET /categories/:id returns category details with relations", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "Detailed Category",
          industryPackIds: [industryPackId],
        });

      const catId = created.body.data.id;

      const res = await request(app)
        .get(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(catId);
      expect(res.body.data.industries).toHaveLength(1);
      expect(res.body.data.industries[0].industryPackId).toBe(industryPackId);
    });

    it("PATCH /categories/:id updates category properties", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Old Category Name" });

      const catId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "New Category Name",
          description: "Updated description",
          model: "gpt-4.1-nano",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("New Category Name");
      expect(res.body.data.model).toBe("gpt-4.1-nano");
    });

    it("DELETE /categories/:id deletes unassigned category successfully", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Temporary Category" });

      const catId = created.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain("deleted successfully");

      // Verify not found
      const checkRes = await request(app)
        .get(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(checkRes.status).toBe(404);
      expect(checkRes.body.code).toBe("EXTRACTION_CATEGORY_NOT_FOUND");
    });

    it("DELETE /categories/:id rejects deletion when category is assigned to a platform agent (409 Conflict)", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Assigned Category" });

      const catId = created.body.data.id;

      // Assign category to platform agent
      await prisma.platformAgentCategory.create({
        data: {
          platformAgentId,
          categoryId: catId,
          sortOrder: 0,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("EXTRACTION_CATEGORY_ATTACHED_TO_AGENT");
    });
  });

  describe("Extraction Categories M2M Associations (/api/v1/admin/extractions/categories/:id/...)", () => {
    it("attaches and detaches industry packs to/from category", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Industry M2M Category" });

      const catId = created.body.data.id;

      // 1. Attach Industry
      const attachRes = await request(app)
        .post(`/api/v1/admin/extractions/categories/${catId}/industries`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ industryPackIds: [industryPackId, industryPackBetaId] });

      expect(attachRes.status).toBe(200);
      expect(attachRes.body.success).toBe(true);

      // Verify attached
      const getRes = await request(app)
        .get(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(getRes.body.data.industries).toHaveLength(2);

      // 2. Detach Industry
      const detachRes = await request(app)
        .delete(`/api/v1/admin/extractions/categories/${catId}/industries/${industryPackId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(detachRes.status).toBe(200);
      expect(detachRes.body.success).toBe(true);

      // Verify 1 remaining
      const afterDetachRes = await request(app)
        .get(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(afterDetachRes.body.data.industries).toHaveLength(1);
      expect(afterDetachRes.body.data.industries[0].industryPackId).toBe(industryPackBetaId);
    });

    it("attaches and detaches dispositions to/from category", async () => {
      const catRes = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Disposition M2M Category" });
      const catId = catRes.body.data.id;

      const dispRes = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "m2m_lead_budget",
          displayName: "Lead Budget",
          question: "What is your budget?",
          isObjective: true,
          showInOverview: true,
        });
      const dispId = dispRes.body.data.id;

      // 1. Attach Disposition
      const attachRes = await request(app)
        .post(`/api/v1/admin/extractions/categories/${catId}/dispositions`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ dispositionIds: [dispId] });

      expect(attachRes.status).toBe(200);
      expect(attachRes.body.success).toBe(true);

      // Verify attached
      const getRes = await request(app)
        .get(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(getRes.body.data.dispositions).toHaveLength(1);
      expect(getRes.body.data.dispositions[0].dispositionId).toBe(dispId);

      // 2. Detach Disposition
      const detachRes = await request(app)
        .delete(`/api/v1/admin/extractions/categories/${catId}/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(detachRes.status).toBe(200);
      expect(detachRes.body.success).toBe(true);

      // Verify removed
      const afterDetach = await request(app)
        .get(`/api/v1/admin/extractions/categories/${catId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(afterDetach.body.data.dispositions).toHaveLength(0);
    });
  });

  describe("Extraction Dispositions CRUD & Validations (/api/v1/admin/extractions/dispositions)", () => {
    it("POST /dispositions creates an objective disposition (201 Created)", async () => {
      const res = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "purchase_timeline",
          displayName: "Purchase Timeline",
          tag: "timeline",
          question: "When are you planning to make the purchase?",
          isObjective: true,
          showInOverview: true,
          objectiveOptions: [
            { value: "Immediate (Within 30 days)", condition: "Customer wants to buy within a month", sortOrder: 1 },
            { value: "1 - 3 Months", condition: "Customer is planning in next 3 months", sortOrder: 2 },
            { value: "3+ Months", condition: "Long term planning", sortOrder: 3 },
          ],
          industryPackIds: [industryPackId],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("purchase_timeline");
      expect(res.body.data.slug).toBe("purchase-timeline");
      expect(res.body.data.isObjective).toBe(true);
      expect(res.body.data.showInOverview).toBe(true);
      expect(res.body.data.objectiveOptions).toHaveLength(3);
    });

    it("POST /dispositions creates a subjective disposition with regex config (201 Created)", async () => {
      const res = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "lead_preferred_area",
          displayName: "Preferred Location",
          tag: "location",
          question: "Which localities or areas are you interested in?",
          isSubjective: true,
          showInInsights: true,
          subjectiveType: "regex",
          subjectiveTypeConfig: {
            pattern: "^[A-Za-z0-9\\s,.-]{3,100}$",
            description: "Location names formatted as words separated by commas",
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isSubjective).toBe(true);
      expect(res.body.data.showInInsights).toBe(true);
      expect(res.body.data.subjectiveType).toBe("regex");
      expect(res.body.data.subjectiveTypeConfig.pattern).toBe("^[A-Za-z0-9\\s,.-]{3,100}$");
    });

    it("POST /dispositions rejects showInOverview=true when isObjective=false with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "invalid_overview_disposition",
          displayName: "Invalid Overview",
          question: "Sample question?",
          isObjective: false,
          showInOverview: true,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("POST /dispositions rejects showInInsights=true when isSubjective=false with 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "invalid_insights_disposition",
          displayName: "Invalid Insights",
          question: "Sample question?",
          isSubjective: false,
          showInInsights: true,
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("POST /dispositions rejects duplicate disposition name with 409 Conflict", async () => {
      await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "customer_annual_income",
          displayName: "Annual Income",
          question: "What is your annual income?",
        });

      const res = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "customer_annual_income",
          displayName: "Annual Income Duplicate",
          question: "Duplicate question?",
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("DUPLICATE_EXTRACTION_DISPOSITION_NAME");
    });

    it("GET /dispositions lists dispositions with pagination and search query", async () => {
      await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "search_target_disposition",
          displayName: "Searchable Commercial Interest",
          tag: "commercial",
          question: "Interested in commercial?",
        });

      const res = await request(app)
        .get("/api/v1/admin/extractions/dispositions?search=Commercial&page=1&limit=10")
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].displayName).toBe("Searchable Commercial Interest");
    });

    it("GET /dispositions/:id and PATCH /dispositions/:id retrieve and update disposition", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "patch_target_disposition",
          displayName: "Initial Display Name",
          question: "Initial question?",
        });
      const dispId = created.body.data.id;

      // 1. Get
      const getRes = await request(app)
        .get(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(dispId);

      // 2. Patch
      const patchRes = await request(app)
        .patch(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          displayName: "Updated Display Name",
          tag: "finance",
          question: "Updated question text?",
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.displayName).toBe("Updated Display Name");
      expect(patchRes.body.data.tag).toBe("finance");
      expect(patchRes.body.data.question).toBe("Updated question text?");
    });

    it("DELETE /dispositions/:id deletes unassigned disposition", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "delete_target_disposition",
          displayName: "To Be Deleted",
          question: "Delete me?",
        });
      const dispId = created.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.data.message).toContain("deleted successfully");

      const checkRes = await request(app)
        .get(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(checkRes.status).toBe(404);
      expect(checkRes.body.code).toBe("EXTRACTION_DISPOSITION_NOT_FOUND");
    });

    it("DELETE /dispositions/:id rejects deletion when disposition belongs to a category assigned to a platform agent", async () => {
      // 1. Create category and disposition
      const catRes = await request(app)
        .post("/api/v1/admin/extractions/categories")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ name: "Guard Test Category" });
      const catId = catRes.body.data.id;

      const dispRes = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "guarded_disposition",
          displayName: "Guarded Disposition",
          question: "Guarded question?",
        });
      const dispId = dispRes.body.data.id;

      // 2. Attach disposition to category
      await request(app)
        .post(`/api/v1/admin/extractions/categories/${catId}/dispositions`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ dispositionIds: [dispId] });

      // 3. Attach category to platform agent
      await prisma.platformAgentCategory.create({
        data: {
          platformAgentId,
          categoryId: catId,
          sortOrder: 0,
        },
      });

      // 4. Try deleting disposition -> 409 Conflict
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(deleteRes.status).toBe(409);
      expect(deleteRes.body.success).toBe(false);
      expect(deleteRes.body.code).toBe("EXTRACTION_DISPOSITION_ATTACHED_TO_AGENT");
    });
  });

  describe("Extraction Dispositions M2M Associations (/api/v1/admin/extractions/dispositions/:id/...)", () => {
    it("attaches and detaches industry packs to/from disposition", async () => {
      const created = await request(app)
        .post("/api/v1/admin/extractions/dispositions")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          name: "m2m_disp_industries",
          displayName: "Disposition with Industries",
          question: "Industry question?",
        });
      const dispId = created.body.data.id;

      // 1. Attach industries
      const attachRes = await request(app)
        .post(`/api/v1/admin/extractions/dispositions/${dispId}/industries`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ industryPackIds: [industryPackId] });

      expect(attachRes.status).toBe(200);
      expect(attachRes.body.success).toBe(true);

      // Verify attached
      const getRes = await request(app)
        .get(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(getRes.body.data.industries).toHaveLength(1);
      expect(getRes.body.data.industries[0].industryPackId).toBe(industryPackId);

      // 2. Detach industry
      const detachRes = await request(app)
        .delete(`/api/v1/admin/extractions/dispositions/${dispId}/industries/${industryPackId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(detachRes.status).toBe(200);
      expect(detachRes.body.success).toBe(true);

      // Verify removed
      const afterDetach = await request(app)
        .get(`/api/v1/admin/extractions/dispositions/${dispId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(afterDetach.body.data.industries).toHaveLength(0);
    });
  });

  describe("Bolna Discovery & Preview Endpoints (/api/v1/admin/extractions/bolna/...)", () => {
    it("GET /bolna/categories returns remote categories preview for agent", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/extractions/bolna/categories?agentBolnaId=${platformAgentId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.categories).toHaveLength(1);
      expect(res.body.data.categories[0].name).toBe("Lead Qualification Group");
      expect(res.body.data.categories[0].id).toBe("bolna-cat-remote-101");
    });

    it("GET /bolna/dispositions returns remote dispositions preview for agent", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/extractions/bolna/dispositions?agentBolnaId=${platformAgentId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe("budget_qualification");
      expect(res.body.data[0].id).toBe("bolna-disp-remote-201");
    });

    it("GET /bolna/categories returns 404 when platform agent is not found", async () => {
      const unknownAgentId = "00000000-0000-4000-8000-000000000000";

      const res = await request(app)
        .get(`/api/v1/admin/extractions/bolna/categories?agentBolnaId=${unknownAgentId}`)
        .set("Authorization", `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("PLATFORM_AGENT_NOT_FOUND");
    });
  });
});
