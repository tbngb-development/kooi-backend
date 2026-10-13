import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { buildContainer } from "../../src/app/container";
import { clearTestDatabase, disconnectTestDatabase } from "../setup/db-test-client";

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

// Mock rate limiters as passthroughs to allow fast-firing functional test runs
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

describe("Authentication API Endpoints (Module 2 - HTTP Pipeline & Cookies)", () => {
  const container = buildContainer();
  const app = buildApp(container);

  beforeEach(async () => {
    await clearTestDatabase();
    await testRedis.flushall();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe("GET /api/health", () => {
    it("returns 200 OK with health status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("OK");
    });
  });

  describe("Owner Registration & Session Cookies", () => {
    it("completes full registration flow with OTP and sets httpOnly cookies", async () => {
      const email = "owner@startup.io";

      // 1. Send OTP
      const otpRes = await request(app)
        .post("/api/v1/auth/register/send-otp")
        .send({ email });

      expect(otpRes.status).toBe(200);
      expect(otpRes.body.success).toBe(true);

      // Find the generated OTP from mock Redis
      const otpKeys = await testRedis.keys("otp:register:*");
      expect(otpKeys.length).toBeGreaterThan(0);

      // 2. Register owner with OTP
      // We can generate and store a known OTP in redis mock for deterministic test
      const testOtp = "123456";
      const crypto = await import("crypto");
      const otpHash = crypto.createHash("sha256").update(testOtp).digest("hex");
      await testRedis.set(`otp:register:${email}`, otpHash);

      const regRes = await request(app)
        .post("/api/v1/auth/register")
        .send({
          tenantName: "Startup Inc",
          email,
          password: "StrongPassword@123",
          name: "Alice Founder",
          termsAccepted: true,
          termsVersion: "v1.0",
          otp: testOtp,
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.success).toBe(true);
      expect(regRes.body.data.user.email).toBe(email);
      expect(regRes.body.data.membership.role).toBe("OWNER");

      // Verify cookies set by the controller
      const cookies = regRes.headers["set-cookie"] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes("access_token="))).toBe(true);
      expect(cookies.some((c) => c.includes("refresh_token="))).toBe(true);
      expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
    });

    it("rejects registration without terms acceptance", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          tenantName: "Startup Inc",
          email: "noterms@startup.io",
          password: "StrongPassword@123",
          name: "Bob",
          termsAccepted: false, // Invalid
          termsVersion: "v1.0",
          otp: "123456",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Login & Token Refresh Lifecycle", () => {
    const email = "registered@company.com";
    const password = "ComplexPassword@123";

    beforeEach(async () => {
      // Seed user via registration
      const testOtp = "654321";
      const crypto = await import("crypto");
      const otpHash = crypto.createHash("sha256").update(testOtp).digest("hex");
      await testRedis.set(`otp:register:${email}`, otpHash);

      await request(app).post("/api/v1/auth/register").send({
        tenantName: "Company Global",
        email,
        password,
        name: "Charlie Leader",
        termsAccepted: true,
        termsVersion: "v1.0",
        otp: testOtp,
      });
    });

    it("logs in with valid credentials and sets session cookies", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requiresTenantSelection).toBe(false);

      const cookies = res.headers["set-cookie"] as unknown as string[];
      expect(cookies.some((c) => c.includes("access_token="))).toBe(true);
    });

    it("rejects login with incorrect password with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassword@999" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rotates refresh token via POST /api/v1/auth/refresh", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password });

      const loginCookies = loginRes.headers["set-cookie"] as unknown as string[];
      const refreshTokenCookie = loginCookies.find((c) =>
        c.startsWith("refresh_token="),
      );
      expect(refreshTokenCookie).toBeDefined();

      // Call refresh with the cookie
      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [refreshTokenCookie!])
        .send({});

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);

      const newCookies = refreshRes.headers["set-cookie"] as unknown as string[];
      expect(newCookies.some((c) => c.includes("access_token="))).toBe(true);
      expect(newCookies.some((c) => c.includes("refresh_token="))).toBe(true);
    });

    it("REPLAY ATTACK VIA HTTP: using an old refresh token revokes session and returns 401", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password });

      const loginCookies = loginRes.headers["set-cookie"] as unknown as string[];
      const oldRefreshTokenCookie = loginCookies.find((c) =>
        c.startsWith("refresh_token="),
      );

      // 1st refresh (valid - old token is revoked, new token is issued)
      const firstRefreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [oldRefreshTokenCookie!])
        .send({});

      expect(firstRefreshRes.status).toBe(200);

      // 2nd refresh with the SAME OLD token (Replay attack simulation!)
      const replayedRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [oldRefreshTokenCookie!])
        .send({});

      expect(replayedRes.status).toBe(401);
      expect(replayedRes.body.success).toBe(false);

      // Also verify that the new token family is killed: even the new token fails!
      const newCookies = firstRefreshRes.headers["set-cookie"] as unknown as string[];
      const newRefreshTokenCookie = newCookies.find((c) =>
        c.startsWith("refresh_token="),
      );

      const subsequentRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [newRefreshTokenCookie!])
        .send({});

      expect(subsequentRes.status).toBe(401);
    });

    it("logs out and clears authentication cookies", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password });

      const loginCookies = loginRes.headers["set-cookie"] as unknown as string[];

      const logoutRes = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", loginCookies)
        .send({});

      expect(logoutRes.status).toBe(200);
      const cookies = logoutRes.headers["set-cookie"] as unknown as string[];
      // Cookies are cleared with Max-Age=0 or empty value
      expect(cookies.some((c) => c.includes("access_token=;") || c.includes("Max-Age=0"))).toBe(true);
    });

    it("accesses GET /api/v1/auth/profile with valid access token", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password });

      const loginCookies = loginRes.headers["set-cookie"] as unknown as string[];

      const profileRes = await request(app)
        .get("/api/v1/auth/profile")
        .set("Cookie", loginCookies);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.success).toBe(true);
      expect(profileRes.body.data.user.email).toBe(email);
    });

    it("rejects GET /api/v1/auth/profile without cookies with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/auth/profile");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
