import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { buildTenantOutboundCallRoutes } from "../presentation/tenant-outbound-call.routes";
import { TenantOutboundCallController } from "../presentation/tenant-outbound-call.controller";
import { InitiateOutboundCallUseCase } from "../application/use-cases/initiate-outbound-call.use-case";
import { ApiKeyCryptoService } from "../../tenant-api-keys/infrastructure/services/api-key-crypto.service";
import { VerifyTenantApiKeyUseCase } from "../../tenant-api-keys/application/use-cases/verify-tenant-api-key.use-case";
import { TenantApiKeyAuthMiddleware } from "../../../shared/middleware/tenant-api-key-auth";
import { createErrorHandler } from "../../../shared/middleware/error-handler";
import type { ITenantApiKeyRepository, CreateTenantApiKeyInput } from "../../tenant-api-keys/application/interfaces/tenant-api-key-repository.interface";
import type { TenantApiKeyEntity } from "../../tenant-api-keys/domain/entities/tenant-api-key.entity";
import type { AssistantRepository, AssistantWithPlatformAgent } from "../../assistants/application/interfaces/assistant-repository.interface";
import type { WalletRepository } from "../../wallet/application/interfaces/wallet-repository.interface";
import type { LeadRepository } from "../../leads/application/interfaces/lead-repository.interface";
import type { CallRepository } from "../application/interfaces/call-repository.interface";
import type { IBolnaClientFactory } from "../../../shared/config/external/bolna/bolna-client.factory";
import { HttpStatus } from "../../../shared/constants/http-status";

// ── In-Memory Repositories ───────────────────────────────────────────────────

class InMemoryTenantApiKeyRepository implements ITenantApiKeyRepository {
  private keys: TenantApiKeyEntity[] = [];
  public tenants: Record<string, { id: string; name: string; isActive: boolean }> = {
    "tenant-1": { id: "tenant-1", name: "Tenant 1", isActive: true },
    "tenant-2": { id: "tenant-2", name: "Tenant 2", isActive: true },
  };

  async create(input: CreateTenantApiKeyInput): Promise<TenantApiKeyEntity> {
    const record: TenantApiKeyEntity = {
      id: `key-id-${this.keys.length + 1}`,
      keyIdentifier: input.keyIdentifier,
      secretHash: input.secretHash,
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      lastAccessedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdByUser: {
        id: input.createdBy,
        name: `User ${input.createdBy}`,
        email: `${input.createdBy}@test.com`,
      },
      tenant: this.tenants[input.tenantId] || null,
    };
    this.keys.push(record);
    return record;
  }

  async findByKeyIdentifier(keyIdentifier: string): Promise<TenantApiKeyEntity | null> {
    return this.keys.find((k) => k.keyIdentifier === keyIdentifier) || null;
  }

  async findByIdAndTenantId(id: string, tenantId: string): Promise<TenantApiKeyEntity | null> {
    return this.keys.find((k) => k.id === id && k.tenantId === tenantId) || null;
  }

  async listByTenantId(tenantId: string, page: number, limit: number): Promise<{ items: TenantApiKeyEntity[]; total: number }> {
    const matching = this.keys.filter((k) => k.tenantId === tenantId);
    return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
  }

  async deleteByIdAndTenantId(id: string, tenantId: string): Promise<boolean> {
    const idx = this.keys.findIndex((k) => k.id === id && k.tenantId === tenantId);
    if (idx === -1) return false;
    this.keys.splice(idx, 1);
    return true;
  }

  async updateLastAccessedAt(id: string, timestamp: Date): Promise<void> {
    const key = this.keys.find((k) => k.id === id);
    if (key) key.lastAccessedAt = timestamp;
  }
}

class InMemoryAssistantRepository implements Partial<AssistantRepository> {
  public assistants: Record<string, AssistantWithPlatformAgent> = {};

  async findByIdWithPlatformAgent(tenantId: string, id: string): Promise<AssistantWithPlatformAgent | null> {
    const a = this.assistants[id];
    if (a && a.tenantId === tenantId) {
      return a;
    }
    return null;
  }
}

class InMemoryWalletRepository implements Partial<WalletRepository> {
  public balances: Record<string, { cashBalance: number; bonusBalance: number; bonusExpiresAt?: Date | null }> = {};

  async findByTenantId(tenantId: string): Promise<any> {
    const entry = this.balances[tenantId];
    if (!entry) return null;
    return {
      id: `wallet-${tenantId}`,
      tenantId,
      cashBalance: entry.cashBalance,
      bonusBalance: entry.bonusBalance,
      bonusExpiresAt: entry.bonusExpiresAt ?? null,
      currency: "INR",
    };
  }
}

class InMemoryLeadRepository implements Partial<LeadRepository> {
  public leads: Array<{ id: string; phone: string; name: string | null; tenantId: string; status: string }> = [];

  async createQuickDialLead(data: { phone: string; name: string | null; tenantId: string; assistantId: string }): Promise<{ id: string }> {
    const id = `lead-${this.leads.length + 1}`;
    this.leads.push({ id, phone: data.phone, name: data.name, tenantId: data.tenantId, status: "PENDING" });
    return { id };
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const lead = this.leads.find((l) => l.id === id);
    if (lead) lead.status = status;
  }
}

class InMemoryCallRepository implements Partial<CallRepository> {
  public calls: Array<{ id: string; bolnaCallId: string; tenantId: string; assistantId: string; leadId: string }> = [];

  async createQuickDialCallRecord(data: any): Promise<{ id: string }> {
    const id = `call-${this.calls.length + 1}`;
    this.calls.push({ id, ...data });
    return { id };
  }
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("Tenant Single Outbound Call Integration Suite (POST /api/v1/calls/outbound)", () => {
  let app: express.Express;
  let apiKeyRepo: InMemoryTenantApiKeyRepository;
  let assistantRepo: InMemoryAssistantRepository;
  let walletRepo: InMemoryWalletRepository;
  let leadRepo: InMemoryLeadRepository;
  let callRepo: InMemoryCallRepository;
  let cryptoService: ApiKeyCryptoService;
  let bolnaClientFactory: IBolnaClientFactory;
  let mockBolnaClient: any;
  let tenant1ApiKey: string;
  let tenant2ApiKey: string;

  const validAssistantId = "11111111-1111-4111-a111-111111111111";
  const foreignAssistantId = "22222222-2222-4222-a222-222222222222";
  const inactiveAssistantId = "33333333-3333-4333-a333-333333333333";
  const inboundOnlyAssistantId = "44444444-4444-4444-a444-444444444444";

  beforeEach(async () => {
    apiKeyRepo = new InMemoryTenantApiKeyRepository();
    assistantRepo = new InMemoryAssistantRepository();
    walletRepo = new InMemoryWalletRepository();
    leadRepo = new InMemoryLeadRepository();
    callRepo = new InMemoryCallRepository();
    cryptoService = new ApiKeyCryptoService();

    // Generate valid API keys for tenant-1 and tenant-2
    const key1 = cryptoService.generateKey();
    await apiKeyRepo.create({
      keyIdentifier: key1.keyIdentifier,
      secretHash: key1.secretHash,
      tenantId: "tenant-1",
      createdBy: "user-1",
    });
    tenant1ApiKey = key1.fullKey;

    const key2 = cryptoService.generateKey();
    await apiKeyRepo.create({
      keyIdentifier: key2.keyIdentifier,
      secretHash: key2.secretHash,
      tenantId: "tenant-2",
      createdBy: "user-2",
    });
    tenant2ApiKey = key2.fullKey;

    // Seed Assistants
    assistantRepo.assistants[validAssistantId] = {
      id: validAssistantId,
      name: "Outbound Sales Assistant",
      tenantId: "tenant-1",
      platformAgentId: "agent-blueprint-1",
      config: {},
      variables: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      platformAgent: {
        id: "agent-blueprint-1",
        bolnaId: "bolna-agent-123",
        name: "Sales Agent",
        slug: "sales-agent",
        type: "OUTBOUND",
        systemPrompt: "You are a sales assistant.",
        welcomeMessage: "Hello, I am calling from Kooi.",
        requiredVariables: null,
        description: null,
        category: null,
        isFeatured: false,
        isActive: true,
        industryPack: null,
      },
    };

    assistantRepo.assistants[foreignAssistantId] = {
      id: foreignAssistantId,
      name: "Tenant 2 Assistant",
      tenantId: "tenant-2",
      platformAgentId: "agent-blueprint-2",
      config: {},
      variables: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      platformAgent: {
        id: "agent-blueprint-2",
        bolnaId: "bolna-agent-222",
        name: "Tenant 2 Agent",
        slug: "t2-agent",
        type: "OUTBOUND",
        systemPrompt: null,
        welcomeMessage: null,
        requiredVariables: null,
        description: null,
        category: null,
        isFeatured: false,
        isActive: true,
        industryPack: null,
      },
    };

    assistantRepo.assistants[inactiveAssistantId] = {
      id: inactiveAssistantId,
      name: "Deactivated Template Assistant",
      tenantId: "tenant-1",
      platformAgentId: "agent-blueprint-inactive",
      config: {},
      variables: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      platformAgent: {
        id: "agent-blueprint-inactive",
        bolnaId: "bolna-agent-333",
        name: "Inactive Agent",
        slug: "inactive-agent",
        type: "OUTBOUND",
        systemPrompt: null,
        welcomeMessage: null,
        requiredVariables: null,
        description: null,
        category: null,
        isFeatured: false,
        isActive: false, // Inactive
        industryPack: null,
      },
    };

    assistantRepo.assistants[inboundOnlyAssistantId] = {
      id: inboundOnlyAssistantId,
      name: "Inbound Support Assistant",
      tenantId: "tenant-1",
      platformAgentId: "agent-blueprint-inbound",
      config: {},
      variables: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      platformAgent: {
        id: "agent-blueprint-inbound",
        bolnaId: "bolna-agent-444",
        name: "Inbound Agent",
        slug: "inbound-agent",
        type: "INBOUND", // Not outbound
        systemPrompt: null,
        welcomeMessage: null,
        requiredVariables: null,
        description: null,
        category: null,
        isFeatured: false,
        isActive: true,
        industryPack: null,
      },
    };

    // Seed Wallets (50000 paisa = 500 INR)
    walletRepo.balances["tenant-1"] = { cashBalance: 50000, bonusBalance: 0 };
    walletRepo.balances["tenant-2"] = { cashBalance: 50000, bonusBalance: 0 };

    // Bolna Client Mock
    mockBolnaClient = {
      calls: {
        create: vi.fn().mockResolvedValue({
          id: "bolna-call-xyz",
          execution_id: "bolna-exec-xyz",
          status: "queued",
        }),
      },
    };
    bolnaClientFactory = {
      forTenant: vi.fn().mockResolvedValue(mockBolnaClient),
      forApiKey: vi.fn().mockResolvedValue(mockBolnaClient),
    };

    // Build Express App
    const verifyApiKeyUseCase = new VerifyTenantApiKeyUseCase(apiKeyRepo, cryptoService);
    const apiKeyAuthMiddleware = new TenantApiKeyAuthMiddleware(verifyApiKeyUseCase);

    const initiateOutboundCallUseCase = new InitiateOutboundCallUseCase(
      bolnaClientFactory,
      walletRepo as any,
      assistantRepo as any,
      leadRepo as any,
      callRepo as any,
    );
    const outboundController = new TenantOutboundCallController(initiateOutboundCallUseCase);

    app = express();
    app.use(express.json());

    // Mount Outbound Call Routes
    app.use(
      "/api/v1/calls",
      buildTenantOutboundCallRoutes(outboundController, apiKeyAuthMiddleware),
    );

    // Mock Dashboard JWT Route to test separation
    app.post("/api/v1/calls/quick-dial", (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer jwt-token")) {
        res.status(401).json({ success: false, error: "Unauthorized JWT session" });
        return;
      }
      res.status(201).json({ success: true, message: "Dashboard Quick Dial accepted" });
    });

    const mockLogger: any = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: () => mockLogger,
    };
    app.use(createErrorHandler(mockLogger));
  });

  // ── 1. Successful Outbound Call ───────────────────────────────────────────
  it("1. should initiate a call successfully with a valid API key and return 201 Created", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        name: "Rahul",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.callId).toBe("call-1");
    expect(res.body.data.status).toBe("queued");

    // Bolna client was called with correct data
    expect(mockBolnaClient.calls.create).toHaveBeenCalledTimes(1);
    expect(mockBolnaClient.calls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "bolna-agent-123",
        recipient_phone_number: "+919876543210",
        user_data: expect.objectContaining({
          customer_name: "Rahul",
        }),
      }),
    );
  });

  // ── 2. Missing or Invalid API Key ─────────────────────────────────────────
  it("2a. should reject request when X-API-Key header is missing", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .send({
        phoneNumber: "+919876543210",
        name: "Rahul",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("API key not provided in X-API-Key header");
  });

  it("2b. should reject request when X-API-Key is invalid", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", "invalid_api_key_12345")
      .send({
        phoneNumber: "+919876543210",
        name: "Rahul",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.success).toBe(false);
  });

  it("2c. should reject request when API key is sent via Authorization: Bearer instead of X-API-Key", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("Authorization", `Bearer ${tenant1ApiKey}`)
      .send({
        phoneNumber: "+919876543210",
        name: "Rahul",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.error).toContain("API key not provided in X-API-Key header");
  });

  // ── 3. Missing Phone Number ───────────────────────────────────────────────
  it("3. should reject request when phoneNumber is missing", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        name: "Rahul",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "phoneNumber" }),
      ]),
    );
  });

  it("3b. should reject request when phoneNumber is not in valid E.164 format", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "9876543210", // Missing leading + and country code
        name: "Rahul",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.details[0].message).toContain("E.164");
  });

  // ── 4. Missing Assistant ID ───────────────────────────────────────────────
  it("4. should reject request when assistantId is missing or not a valid UUID", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        name: "Rahul",
      });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "assistantId" }),
      ]),
    );
  });

  // ── 5. Optional Name Omitted ──────────────────────────────────────────────
  it("5. should accept request when optional name is omitted", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(leadRepo.leads[0].name).toBeNull();
  });

  // ── 6. Inactive Assistant ─────────────────────────────────────────────────
  it("6. should reject request when assistant template is inactive", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: inactiveAssistantId,
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe("PLATFORM_AGENT_NOT_ACTIVE");
  });

  // ── 7. Assistant Belonging to Another Tenant ──────────────────────────────
  it("7. should reject request with 404 when assistant belongs to another tenant", async () => {
    // tenant-1 attempts to call using tenant-2's assistant
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: foreignAssistantId,
      });

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.error).toContain("Assistant");
  });

  // ── 8. Assistant Not Configured for Outbound Calls ─────────────────────────
  it("8. should reject request when assistant is configured only for INBOUND calls", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: inboundOnlyAssistantId,
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe("ASSISTANT_NOT_OUTBOUND_CAPABLE");
  });

  // ── 9. Insufficient Wallet Balance ────────────────────────────────────────
  it("9. should reject request when tenant wallet balance is zero or negative", async () => {
    walletRepo.balances["tenant-1"] = { cashBalance: 0, bonusBalance: 0 };

    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body.code).toBe("INSUFFICIENT_BALANCE");
    expect(mockBolnaClient.calls.create).not.toHaveBeenCalled();
  });

  // ── 10. Provider / Orchestration Failure ──────────────────────────────────
  it("10. should handle provider failure by setting lead status to FAILED and returning error", async () => {
    mockBolnaClient.calls.create.mockRejectedValueOnce(
      new Error("Bolna Telephony Gateway Down"),
    );

    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(leadRepo.leads[0].status).toBe("FAILED");
    expect(callRepo.calls).toHaveLength(0);
  });

  // ── 11. Rate Limiting ─────────────────────────────────────────────────────
  it("11. should enforce rate limiting after 60 requests per minute per tenant", async () => {
    // 60 allowed calls for tenant-2
    for (let i = 0; i < 60; i++) {
      const res = await request(app)
        .post("/api/v1/calls/outbound")
        .set("X-API-Key", tenant2ApiKey)
        .send({
          phoneNumber: "+919876543210",
          assistantId: foreignAssistantId,
        });
      expect(res.status).toBe(HttpStatus.CREATED);
    }

    // 61st call is blocked with 429
    const blockedRes = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant2ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: foreignAssistantId,
      });

    expect(blockedRes.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(blockedRes.body.code).toBe("TOO_MANY_REQUESTS");
  });

  // ── 12. Exactly One Call Initiated Per Request ────────────────────────────
  it("12. should initiate exactly one call per accepted request", async () => {
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: validAssistantId,
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(mockBolnaClient.calls.create).toHaveBeenCalledTimes(1);
    expect(leadRepo.leads).toHaveLength(1);
    expect(callRepo.calls).toHaveLength(1);
  });

  // ── 13. JWT Dashboard Authentication Remains Unchanged ────────────────────
  it("13. should keep dashboard JWT authentication working unchanged on other routes", async () => {
    // Reject request to dashboard endpoint without JWT
    const unauthRes = await request(app)
      .post("/api/v1/calls/quick-dial")
      .send({ assistantId: validAssistantId, phone: "+919876543210" });
    expect(unauthRes.status).toBe(HttpStatus.UNAUTHORIZED);

    // Accept request to dashboard endpoint with valid JWT
    const authRes = await request(app)
      .post("/api/v1/calls/quick-dial")
      .set("Authorization", "Bearer jwt-token-xyz")
      .send({ assistantId: validAssistantId, phone: "+919876543210" });
    expect(authRes.status).toBe(HttpStatus.CREATED);
  });

  // ── 14. No Body Tenant ID Can Override API Key Context ───────────────────
  it("14. should resolve tenant context exclusively from API key and ignore body tenantId", async () => {
    // Caller sends key for tenant-1, but attempts to spoof tenant-2 in the body
    const res = await request(app)
      .post("/api/v1/calls/outbound")
      .set("X-API-Key", tenant1ApiKey)
      .send({
        phoneNumber: "+919876543210",
        assistantId: validAssistantId,
        tenantId: "tenant-2", // Spoofed tenant
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    // Lead must be created under tenant-1, NOT tenant-2
    expect(leadRepo.leads[0].tenantId).toBe("tenant-1");
    expect(callRepo.calls[0].tenantId).toBe("tenant-1");
  });
});
