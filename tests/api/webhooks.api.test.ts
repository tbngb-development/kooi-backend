import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { buildContainer } from "../../src/app/container";
import prisma from "../../src/shared/config/database/prisma";
import { clearTestDatabase, disconnectTestDatabase } from "../setup/db-test-client";
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

describe("Bolna Webhooks & Call Settlement API (Module 10)", () => {
  const container = buildContainer();
  const app = buildApp(container);

  // Test RFC UUIDs
  const tenantId = "11111111-aaaa-4111-8111-aaaaaaaaaaaa";
  const userId = "11111111-bbbb-4111-8111-bbbbbbbbbbbb";
  const memberId = "11111111-cccc-4111-8111-cccccccccccc";
  const platformAdminId = "99999999-aaaa-4999-8999-aaaaaaaaaaaa";

  const sharedApiKeyId = "aaaaaaaa-0000-4aaa-8aaa-000000000000";
  const platformAgentId = "aaaaaaaa-1111-4aaa-8aaa-111111111111";
  const assistantId = "bbbbbbbb-1111-4bbb-8bbb-111111111111";
  const campaignId = "cccccccc-1111-4ccc-8ccc-111111111111";

  const planId = "dddddddd-1111-4ddd-8ddd-111111111111";
  const planVersionId = "dddddddd-2222-4ddd-8ddd-222222222222";
  const tenantPlanId = "dddddddd-3333-4ddd-8ddd-333333333333";

  const batchId = "33333333-1111-4333-8333-111111111111";
  const lead1Id = "44444444-1111-4444-8444-111111111111";
  const call1Id = "55555555-1111-4555-8555-111111111111";

  const bolnaCallId = "bolna-call-alpha-1";
  const bolnaBatchId = "bolna-batch-alpha-1";

  beforeEach(async () => {
    await clearTestDatabase();

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

    // 3. Seed Plan & Published Version (₹1.50/min = 150 paisa, min 30s, inc 30s)
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

    // 4. Seed Tenant with Wallet & Active Plan
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "Alpha Corp",
        email: "alpha@example.com",
        isActive: true,
        bolnaApiKey: {
          connect: { id: sharedApiKeyId },
        },
      },
    });

    await prisma.wallet.create({
      data: {
        tenantId,
        cashBalance: 50000,
        bonusBalance: 5000,
        currency: "INR",
      },
    });

    await prisma.tenantPlan.create({
      data: {
        id: tenantPlanId,
        tenantId,
        planId,
        planVersionId,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });

    // 5. Seed Owner User
    await prisma.user.create({
      data: {
        id: userId,
        name: "Owner User",
        email: "owner@alpha.com",
        password: "hashed-owner-password",
        isActive: true,
        memberships: {
          create: {
            id: memberId,
            tenantId,
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
        welcomeMessage: "Hello, how can I help you?",
        systemPrompt: "You are an assistant.",
        requiredVariables: [],
        defaultConfig: { agent_name: "Inbound Real Estate Agent" },
        isActive: true,
        bolnaApiKeyId: sharedApiKeyId,
      },
    });

    // 7. Seed Assistant
    await prisma.assistant.create({
      data: {
        id: assistantId,
        tenantId,
        platformAgentId,
        name: "Alpha Sales Agent",
        config: {},
      },
    });

    // 8. Seed Campaign
    await prisma.campaign.create({
      data: {
        id: campaignId,
        tenantId,
        assistantId,
        name: "Q4 Outbound Drive",
        status: "RUNNING",
      },
    });

    // 9. Seed LeadBatch
    await prisma.leadBatch.create({
      data: {
        id: batchId,
        tenantId,
        campaignId,
        bolnaBatchId,
        fileName: "batch-001.csv",
        status: "RUNNING",
        scheduledAt: null,
        retryConfig: {
          enabled: true,
          max_retries: 2,
          retry_on_statuses: ["no-answer", "busy"],
        },
      },
    });

    // 10. Seed Lead
    await prisma.lead.create({
      data: {
        id: lead1Id,
        tenantId,
        campaignId,
        batchId,
        phone: "+919876500001",
        name: "Jane Smith",
        status: "CALLING",
      },
    });

    // 11. Seed Call
    await prisma.call.create({
      data: {
        id: call1Id,
        tenantId,
        campaignId,
        leadId: lead1Id,
        batchId,
        bolnaCallId,
        status: "PENDING",
      },
    });
  });

  afterAll(async () => {
    await clearTestDatabase();
    await disconnectTestDatabase();
  });

  async function waitForCallSettled(callId: string, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const call = await prisma.call.findUnique({ where: { id: callId } });
      if (call?.status === "COMPLETED" && call.billableSeconds !== null) return call;
      await new Promise((r) => setTimeout(r, 40));
    }
    return prisma.call.findUniqueOrThrow({ where: { id: callId } });
  }

  async function waitForCallStatus(callId: string, expectedStatus: string, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const call = await prisma.call.findUnique({ where: { id: callId } });
      if (call?.status === expectedStatus) return call;
      await new Promise((r) => setTimeout(r, 40));
    }
    return prisma.call.findUniqueOrThrow({ where: { id: callId } });
  }

  async function waitForBatchStatus(batchId: string, expectedStatus: string, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const batch = await prisma.leadBatch.findUnique({ where: { id: batchId } });
      if (batch?.status === expectedStatus) return batch;
      await new Promise((r) => setTimeout(r, 40));
    }
    return prisma.leadBatch.findUniqueOrThrow({ where: { id: batchId } });
  }

  describe("POST /api/webhooks/bolna (Call Webhook Lifecycle)", () => {
    it("returns { received: true } immediately even on invalid payload without crashing", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna")
        .send({ status: "in-progress" }); // missing id/execution_id

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it("processes in-flight event (status: in-progress) and transitions call, batch, and campaign to RUNNING", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "in-progress",
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      // Verify DB state
      const call = await waitForCallStatus(call1Id, "CALLING");
      expect(call.status).toBe("CALLING");

      const batch = await prisma.leadBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batch.status).toBe("RUNNING");

      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
      expect(campaign.status).toBe("RUNNING");
    });

    it("settles completed call: debits prepaid wallet (bonus first), creates ledger record, stores transcript, and updates cost snapshot", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "completed",
          telephony_data: {
            duration: 45, // 45s duration
            recording_url: "https://recordings.bolna.ai/call-alpha-1.mp3",
          },
          messages: [
            { role: "agent", content: "Hi Jane", created_at: "2026-10-12T10:00:00Z" },
            { role: "user", content: "Yes I am interested", created_at: "2026-10-12T10:00:05Z" },
          ],
          extracted_data: { budget: "80 Lakhs", location: "Kochi" },
          total_cost: 0.04,
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      // 1. Verify Call is COMPLETED and settlement breakdown recorded
      const updatedCall = await waitForCallSettled(call1Id);
      expect(updatedCall.status).toBe("COMPLETED");
      expect(updatedCall.duration).toBe(45);
      expect(updatedCall.recording).toBe("https://recordings.bolna.ai/call-alpha-1.mp3");
      expect(updatedCall.transcript).toContain("assistant: Hi Jane");
      expect(updatedCall.transcript).toContain("user: Yes I am interested");

      // 2. Billing Math Verification:
      // Rate = 150 paisa/min, min = 30s, inc = 30s.
      // Duration = 45s => billableSeconds = 60s => cost = 150 paisa.
      expect(updatedCall.billableSeconds).toBe(60);
      expect(updatedCall.platformCost).toBe(150);

      // 3. Verify Lead is marked CALLED
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead1Id } });
      expect(lead.status).toBe("CALLED");

      // 4. Verify Wallet Deductions (Bonus First):
      // Initial: cash: 50,000, bonus: 5,000
      // 150 paisa deducted strictly from bonus first!
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { tenantId } });
      expect(wallet.bonusBalance).toBe(4850);
      expect(wallet.cashBalance).toBe(50000);

      // 5. Verify Wallet Transaction Record
      const tx = await prisma.walletTransaction.findFirstOrThrow({
        where: {
          walletId: wallet.id,
          sourceType: "CALL",
          sourceId: call1Id,
        },
      });
      expect(tx.type).toBe("DEBIT");
      expect(tx.sourceType).toBe("CALL");
      expect(tx.amount).toBe(150);
      expect(tx.bonusDelta).toBe(-150);
      expect(tx.cashDelta).toBe(0);
      expect(tx.idempotencyKey).toBe(`call:${call1Id}:${bolnaCallId}`);

      // 6. Verify Batch & Campaign auto-completion (since this was the only active lead)
      const batch = await prisma.leadBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batch.status).toBe("COMPLETED");

      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
      expect(campaign.status).toBe("COMPLETED");
    });

    it("IDEMPOTENCY DEFENSE: repeated completed webhook does NOT double-debit the wallet or duplicate ledger rows", async () => {
      // First webhook
      await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "completed",
          telephony_data: { duration: 45 },
        });

      await waitForCallSettled(call1Id);

      const walletAfterFirst = await prisma.wallet.findUniqueOrThrow({ where: { tenantId } });
      const firstBonus = walletAfterFirst.bonusBalance;
      const firstCash = walletAfterFirst.cashBalance;

      // Duplicate webhook retry from Bolna
      const res2 = await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "completed",
          telephony_data: { duration: 45 },
        });

      expect(res2.status).toBe(200);

      // Give second webhook a moment to ensure idempotency guard exercised
      await new Promise((r) => setTimeout(r, 60));

      // Verify wallet balance is COMPLETELY UNTOUCHED on second arrival
      const walletAfterSecond = await prisma.wallet.findUniqueOrThrow({ where: { tenantId } });
      expect(walletAfterSecond.bonusBalance).toBe(firstBonus);
      expect(walletAfterSecond.cashBalance).toBe(firstCash);

      // Verify exactly ONE ledger transaction exists
      const txCount = await prisma.walletTransaction.count({
        where: {
          walletId: walletAfterSecond.id,
          sourceType: "CALL",
          sourceId: call1Id,
        },
      });
      expect(txCount).toBe(1);
    });

    it("STATE MACHINE DEFENSE: out-of-order in-flight event does NOT regress an already COMPLETED call", async () => {
      // Complete the call
      await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "completed",
          telephony_data: { duration: 30 },
        });

      const callCompleted = await waitForCallSettled(call1Id);
      expect(callCompleted.status).toBe("COMPLETED");

      // Late arriving "ringing" event from telephony provider
      await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "ringing",
        });

      // Brief pause to ensure async handler processed
      await new Promise((r) => setTimeout(r, 60));

      // Status must STILL be COMPLETED
      const callAfterLateRinging = await prisma.call.findUniqueOrThrow({ where: { id: call1Id } });
      expect(callAfterLateRinging.status).toBe("COMPLETED");
    });

    it("schedules retry for no-answer event when retries are configured and available", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "no-answer",
        });

      expect(res.status).toBe(200);

      const call = await waitForCallStatus(call1Id, "SCHEDULED");
      expect(call.status).toBe("SCHEDULED"); // Retried!

      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead1Id } });
      expect(lead.status).toBe("NO_ANSWER");
    });

    it("transitions call and lead to STOPPED when call canceled/stopped event is received", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna")
        .send({
          id: bolnaCallId,
          status: "stopped",
        });

      expect(res.status).toBe(200);

      const call = await waitForCallStatus(call1Id, "STOPPED");
      expect(call.status).toBe("STOPPED");

      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead1Id } });
      expect(lead.status).toBe("STOPPED");
    });
  });

  describe("POST /api/webhooks/bolna-batch (Batch Webhook Lifecycle)", () => {
    it("handles batch running status update", async () => {
      // Put batch in SCHEDULED first
      await prisma.leadBatch.update({
        where: { id: batchId },
        data: { status: "SCHEDULED", scheduledAt: new Date() },
      });

      const res = await request(app)
        .post("/api/webhooks/bolna-batch")
        .send({
          batch_id: bolnaBatchId,
          state: "running",
        });

      expect(res.status).toBe(200);

      const batch = await waitForBatchStatus(batchId, "RUNNING");
      expect(batch.status).toBe("RUNNING");
    });

    it("handles batch completed status and reconciles campaign", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna-batch")
        .send({
          batch_id: bolnaBatchId,
          state: "completed",
        });

      expect(res.status).toBe(200);

      const batch = await waitForBatchStatus(batchId, "COMPLETED");
      expect(batch.status).toBe("COMPLETED");

      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
      expect(campaign.status).toBe("COMPLETED");
    });

    it("handles batch stopped status and stops remaining calls and leads", async () => {
      const res = await request(app)
        .post("/api/webhooks/bolna-batch")
        .send({
          batch_id: bolnaBatchId,
          state: "stopped",
        });

      expect(res.status).toBe(200);

      const batch = await waitForBatchStatus(batchId, "STOPPED");
      expect(batch.status).toBe("STOPPED");

      const call = await waitForCallStatus(call1Id, "STOPPED");
      expect(call.status).toBe("STOPPED");

      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead1Id } });
      expect(lead.status).toBe("STOPPED");
    });

    it("preserves manual local STOPPED batch status when Bolna sends late COMPLETED", async () => {
      // Batch was stopped locally by tenant owner
      await prisma.leadBatch.update({
        where: { id: batchId },
        data: { status: "STOPPED" },
      });

      const res = await request(app)
        .post("/api/webhooks/bolna-batch")
        .send({
          batch_id: bolnaBatchId,
          state: "completed",
        });

      expect(res.status).toBe(200);

      // Brief delay to ensure background execution finished
      await new Promise((r) => setTimeout(r, 80));

      // Status must remain STOPPED so user can resume
      const batch = await prisma.leadBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batch.status).toBe("STOPPED");
    });
  });
});
