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

describe("Multi-Tenant Isolation & RBAC Security Boundary (Module 3)", () => {
  const container = buildContainer();
  const app = buildApp(container);
  const jwtService = new JwtTokenService();

  // Test Entity Identifiers
  const bolnaKeyId = "test-bolna-key-uuid";
  const agentId = "test-platform-agent-uuid";

  const tenantAId = "tenant-alpha-uuid";
  const userAOwnerId = "user-alpha-owner-uuid";
  const memberAOwnerMembershipId = "mem-alpha-owner-uuid";
  const userAMemberId = "user-alpha-member-uuid";
  const memberAMemberMembershipId = "mem-alpha-member-uuid";
  const assistantAId = "assistant-alpha-uuid";
  const campaignAId = "campaign-alpha-uuid";

  const tenantBId = "tenant-beta-uuid";
  const userBOwnerId = "user-beta-owner-uuid";
  const memberBOwnerMembershipId = "mem-beta-owner-uuid";

  const platformAdminId = "user-platform-admin-uuid";

  // Auth Tokens
  let tokenTenantAOwner: string;
  let tokenTenantAMember: string;
  let tokenTenantBOwner: string;
  let tokenPlatformAdmin: string;

  beforeEach(async () => {
    await clearTestDatabase();
    await testRedis.flushall();

    // 1. Seed Shared Bolna API Key & Master Agent Blueprint
    await prisma.bolnaApiKey.create({
      data: {
        id: bolnaKeyId,
        keyIdentifier: "bolna-key-test",
        encryptedKey: "iv:auth:cipher",
        createdBy: "system",
      },
    });

    await prisma.platformAgent.create({
      data: {
        id: agentId,
        bolnaId: "bolna-tpl-123",
        slug: "general-sales-qualifier",
        name: "General Sales Qualifier",
        defaultConfig: {},
        bolnaApiKeyId: bolnaKeyId,
      },
    });

    // 2. Seed Tenant Alpha & Users
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
        name: "Alice Alpha",
        email: "alice@alpha.io",
        password: "hashed-password-123",
        isActive: true,
        memberships: {
          create: {
            id: memberAOwnerMembershipId,
            tenantId: tenantAId,
            role: "OWNER",
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        id: userAMemberId,
        name: "Adam Member",
        email: "adam@alpha.io",
        password: "hashed-password-123",
        isActive: true,
        memberships: {
          create: {
            id: memberAMemberMembershipId,
            tenantId: tenantAId,
            role: "USER",
          },
        },
      },
    });

    await prisma.assistant.create({
      data: {
        id: assistantAId,
        name: "Alpha Calling Assistant",
        tenantId: tenantAId,
        platformAgentId: agentId,
        config: {},
      },
    });

    await prisma.campaign.create({
      data: {
        id: campaignAId,
        name: "Alpha Outbound Marketing",
        tenantId: tenantAId,
        assistantId: assistantAId,
        status: "DRAFT",
      },
    });

    // 3. Seed Tenant Beta & Owner
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
        name: "Bob Beta",
        email: "bob@beta.io",
        password: "hashed-password-123",
        isActive: true,
        memberships: {
          create: {
            id: memberBOwnerMembershipId,
            tenantId: tenantBId,
            role: "OWNER",
          },
        },
      },
    });

    // 4. Seed Platform Admin
    await prisma.user.create({
      data: {
        id: platformAdminId,
        name: "Super Platform Admin",
        email: "superadmin@platform.io",
        password: "hashed-password-123",
        isActive: true,
        platformAdmin: {
          create: {},
        },
      },
    });

    // Generate valid JWT tokens
    tokenTenantAOwner = jwtService.generateAccessToken({
      userId: userAOwnerId,
      membershipId: memberAOwnerMembershipId,
      tenantId: tenantAId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });

    tokenTenantAMember = jwtService.generateAccessToken({
      userId: userAMemberId,
      membershipId: memberAMemberMembershipId,
      tenantId: tenantAId,
      tenantRole: "USER",
      isPlatformAdmin: false,
    });

    tokenTenantBOwner = jwtService.generateAccessToken({
      userId: userBOwnerId,
      membershipId: memberBOwnerMembershipId,
      tenantId: tenantBId,
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    });

    tokenPlatformAdmin = jwtService.generateAdminAccessToken(platformAdminId);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("Cross-Tenant Data Isolation & IDOR Protection", () => {
    it("Tenant A Owner can read Tenant A's campaign", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}`)
        .set("Cookie", [`access_token=${tokenTenantAOwner}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(campaignAId);
      expect(res.body.data.name).toBe("Alpha Outbound Marketing");
    });

    it("IDOR DEFENSE: Tenant B Owner CANNOT read Tenant A's campaign and receives 404 Not Found", async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}`)
        .set("Cookie", [`access_token=${tokenTenantBOwner}`]);

      // Strict security requirement: 404 Not Found prevents resource enumeration across tenants
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    });

    it("LIST ISOLATION: Tenant B listing campaigns sees 0 items, never Tenant A's campaigns", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns")
        .set("Cookie", [`access_token=${tokenTenantBOwner}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it("CROSS-TENANT MUTATION DEFENSE: Tenant B Owner cannot archive Tenant A's campaign (returns 404)", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAId}/archive`)
        .set("Cookie", [`access_token=${tokenTenantBOwner}`]);

      expect(res.status).toBe(404);

      // Verify in DB that campaign A remains unarchived
      const campaignInDb = await prisma.campaign.findUnique({
        where: { id: campaignAId },
      });
      expect(campaignInDb?.isDeleted).toBe(false);
    });
  });

  describe("Role-Based Access Control (RBAC) within Tenant", () => {
    it("Tenant USER role is rejected with 403 Forbidden when attempting OWNER/ADMIN action (archive campaign)", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAId}/archive`)
        .set("Cookie", [`access_token=${tokenTenantAMember}`]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);

      // Verify campaign was not archived
      const campaignInDb = await prisma.campaign.findUnique({
        where: { id: campaignAId },
      });
      expect(campaignInDb?.isDeleted).toBe(false);
    });

    it("Tenant OWNER role is allowed to archive campaign (returns 200 OK)", async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignAId}/archive`)
        .set("Cookie", [`access_token=${tokenTenantAOwner}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify soft-deleted in DB
      const campaignInDb = await prisma.campaign.findUnique({
        where: { id: campaignAId },
      });
      expect(campaignInDb?.isDeleted).toBe(true);
    });
  });

  describe("Platform Admin Security Boundary", () => {
    it("Tenant Owner is rejected with 403 Forbidden from accessing Platform Admin routes", async () => {
      const res = await request(app)
        .get("/api/v1/admin/tenants")
        .set("Cookie", [`access_token=${tokenTenantAOwner}`]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("Platform Admin is authorized and can access Platform Admin routes (returns 200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/admin/tenants")
        .set("Cookie", [`access_token=${tokenPlatformAdmin}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("Lifecycle Boundary: Deactivated Users & Suspended Tenants", () => {
    it("rejects requests with 403 Forbidden when tenant organization is deactivated in DB", async () => {
      // Deactivate Tenant B
      await prisma.tenant.update({
        where: { id: tenantBId },
        data: { isActive: false },
      });

      const res = await request(app)
        .get("/api/v1/campaigns")
        .set("Cookie", [`access_token=${tokenTenantBOwner}`]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("inactive");
    });

    it("rejects requests with 401 Unauthorized and wipes cookies when user is deactivated in DB", async () => {
      // Deactivate Alice
      await prisma.user.update({
        where: { id: userAOwnerId },
        data: { isActive: false },
      });

      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}`)
        .set("Cookie", [`access_token=${tokenTenantAOwner}`]);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("deactivated");

      const cookies = res.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.includes("access_token=;") || c.includes("Max-Age=0"))).toBe(true);
    });
  });
});
