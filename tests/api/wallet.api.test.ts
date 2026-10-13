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

// Mock rate limiters as passthroughs
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

describe("Wallet, Billing & Financial Ledger API (Module 5)", () => {
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

    // 2. Seed Tenant Alpha & Owner
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: "Tenant Alpha",
        email: "alpha@example.com",
        isActive: true,
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

    // 3. Seed Tenant Beta & Owner
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: "Tenant Beta",
        email: "beta@example.com",
        isActive: true,
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

    // 4. Seed Wallets for both tenants
    await prisma.wallet.create({
      data: {
        tenantId: tenantAId,
        cashBalance: 50000, // ₹500
        bonusBalance: 15000, // ₹150
        bonusExpiresAt: new Date(Date.now() + 86400000), // unexpired
        currency: "INR",
        isActive: true,
      },
    });

    await prisma.wallet.create({
      data: {
        tenantId: tenantBId,
        cashBalance: 120000, // ₹1,200
        bonusBalance: 0,
        bonusExpiresAt: null,
        currency: "INR",
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  describe("Tenant Wallet Operations (/api/v1/wallet)", () => {
    it("GET /api/v1/wallet rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/wallet");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/wallet returns tenant wallet balances and enforces strict tenant isolation", async () => {
      // 1. Tenant A fetches wallet
      const resA = await request(app)
        .get("/api/v1/wallet")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.success).toBe(true);
      expect(resA.body.data.tenantId).toBe(tenantAId);
      expect(resA.body.data.cashBalance).toBe(50000);
      expect(resA.body.data.bonusBalance).toBe(15000);
      expect(resA.body.data.totalBalance).toBe(65000);
      expect(resA.body.data.currency).toBe("INR");
      expect(resA.body.data.isActive).toBe(true);

      // 2. Tenant B fetches wallet
      const resB = await request(app)
        .get("/api/v1/wallet")
        .set("Authorization", `Bearer ${tenantBOwnerToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.success).toBe(true);
      expect(resB.body.data.tenantId).toBe(tenantBId);
      expect(resB.body.data.cashBalance).toBe(120000);
      expect(resB.body.data.bonusBalance).toBe(0);
      expect(resB.body.data.totalBalance).toBe(120000);
    });

    it("GET /api/v1/wallet/transactions returns paginated transactions with type filtering", async () => {
      const walletA = await prisma.wallet.findUnique({ where: { tenantId: tenantAId } });

      // Seed transactions for Tenant A
      await prisma.walletTransaction.createMany({
        data: [
          {
            walletId: walletA!.id,
            tenantId: tenantAId,
            type: "CREDIT",
            amount: 50000,
            cashDelta: 50000,
            bonusDelta: 0,
            cashBalanceAfter: 50000,
            bonusBalanceAfter: 0,
            description: "Razorpay recharge",
            sourceType: "RECHARGE",
          },
          {
            walletId: walletA!.id,
            tenantId: tenantAId,
            type: "BONUS",
            amount: 15000,
            cashDelta: 0,
            bonusDelta: 15000,
            cashBalanceAfter: 50000,
            bonusBalanceAfter: 15000,
            description: "Onboarding plan bonus",
            sourceType: "PLAN_BONUS",
          },
          {
            walletId: walletA!.id,
            tenantId: tenantAId,
            type: "DEBIT",
            amount: 300,
            cashDelta: 0,
            bonusDelta: -300,
            cashBalanceAfter: 50000,
            bonusBalanceAfter: 14700,
            description: "AI Voice Call call-1",
            sourceType: "CALL",
          },
        ],
      });

      // 1. Fetch all transactions
      const resAll = await request(app)
        .get("/api/v1/wallet/transactions?page=1&limit=10")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(resAll.status).toBe(200);
      expect(resAll.body.success).toBe(true);
      expect(resAll.body.data.total).toBe(3);
      expect(resAll.body.data.items).toHaveLength(3);
      expect(resAll.body.data.page).toBe(1);

      // 2. Fetch with filter type=DEBIT
      const resDebit = await request(app)
        .get("/api/v1/wallet/transactions?page=1&limit=10&type=DEBIT")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(resDebit.status).toBe(200);
      expect(resDebit.body.data.total).toBe(1);
      expect(resDebit.body.data.items[0].type).toBe("DEBIT");
      expect(resDebit.body.data.items[0].amount).toBe(300);

      // 3. Validation: rejects invalid query params (page=0)
      const resInvalid = await request(app)
        .get("/api/v1/wallet/transactions?page=0")
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect(resInvalid.status).toBe(422);
    });
  });

  describe("Platform Admin Wallet Controls (/api/v1/admin/wallet)", () => {
    it("rejects non-platform-admin users from admin wallet routes with 401/403", async () => {
      // Tenant owner trying to hit admin wallet route
      const res = await request(app)
        .get(`/api/v1/admin/wallet/tenants/${tenantAId}`)
        .set("Authorization", `Bearer ${tenantAOwnerToken}`);

      expect([401, 403]).toContain(res.status);

      // Unauthenticated request
      const resUnauth = await request(app).get(
        `/api/v1/admin/wallet/tenants/${tenantAId}`,
      );
      expect(resUnauth.status).toBe(401);
    });

    it("GET /api/v1/admin/wallet/tenants/:tenantId returns target tenant's wallet details", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/wallet/tenants/${tenantAId}`)
        .set("Authorization", `Bearer ${platformAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId).toBe(tenantAId);
      expect(res.body.data.cashBalance).toBe(50000);
      expect(res.body.data.bonusBalance).toBe(15000);
    });

    it("POST /api/v1/admin/wallet/adjust credits cash to tenant wallet", async () => {
      const res = await request(app)
        .post("/api/v1/admin/wallet/adjust")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          tenantId: tenantAId,
          amount: 25000, // ₹250
          type: "CREDIT",
          targetBalance: "CASH",
          description: "Administrative goodwill credit",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(25000);
      expect(res.body.data.cashDelta).toBe(25000);
      expect(res.body.data.bonusDelta).toBe(0);

      // Verify DB balance updated
      const updatedWallet = await prisma.wallet.findUnique({
        where: { tenantId: tenantAId },
      });
      expect(updatedWallet!.cashBalance).toBe(75000); // 50,000 + 25,000
    });

    it("POST /api/v1/admin/wallet/adjust credits bonus with expiration date", async () => {
      const expiry = new Date(Date.now() + 7 * 86400000).toISOString();

      const res = await request(app)
        .post("/api/v1/admin/wallet/adjust")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          tenantId: tenantAId,
          amount: 10000,
          type: "BONUS",
          targetBalance: "BONUS",
          description: "Promotional campaign credits",
          bonusExpiresAt: expiry,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(10000);
      expect(res.body.data.bonusDelta).toBe(10000);

      // Verify DB bonus updated
      const updatedWallet = await prisma.wallet.findUnique({
        where: { tenantId: tenantAId },
      });
      expect(updatedWallet!.bonusBalance).toBe(25000); // 15,000 + 10,000
      expect(updatedWallet!.bonusExpiresAt).not.toBeNull();
    });

    it("POST /api/v1/admin/wallet/adjust debits cash from tenant wallet", async () => {
      const res = await request(app)
        .post("/api/v1/admin/wallet/adjust")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          tenantId: tenantBId,
          amount: 20000, // ₹200
          type: "DEBIT",
          description: "Manual penalty deduction",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(20000);
      expect(res.body.data.type).toBe("DEBIT");

      // Verify DB balance deducted
      const updatedWallet = await prisma.wallet.findUnique({
        where: { tenantId: tenantBId },
      });
      expect(updatedWallet!.cashBalance).toBe(100000); // 120,000 - 20,000
    });

    it("POST /api/v1/admin/wallet/adjust rejects invalid payload with 422", async () => {
      const res = await request(app)
        .post("/api/v1/admin/wallet/adjust")
        .set("Authorization", `Bearer ${platformAdminToken}`)
        .send({
          tenantId: tenantAId,
          amount: -500, // Invalid: negative amount
          type: "CREDIT",
          description: "", // Invalid: empty description
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });
});
