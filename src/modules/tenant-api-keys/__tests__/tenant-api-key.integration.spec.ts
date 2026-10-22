import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response } from "express";
import { buildTenantApiKeyRoutes } from "../presentation/tenant-api-key.routes";
import { TenantApiKeyController } from "../presentation/tenant-api-key.controller";
import { CreateTenantApiKeyUseCase } from "../application/use-cases/create-tenant-api-key.use-case";
import { ListTenantApiKeysUseCase } from "../application/use-cases/list-tenant-api-keys.use-case";
import { DeleteTenantApiKeyUseCase } from "../application/use-cases/delete-tenant-api-key.use-case";
import { VerifyTenantApiKeyUseCase } from "../application/use-cases/verify-tenant-api-key.use-case";
import { ApiKeyCryptoService } from "../infrastructure/services/api-key-crypto.service";
import { TenantApiKeyAuthMiddleware } from "../../../shared/middleware/tenant-api-key-auth";
import { createErrorHandler } from "../../../shared/middleware/error-handler";
import type { ITenantApiKeyRepository, CreateTenantApiKeyInput } from "../application/interfaces/tenant-api-key-repository.interface";
import type { TenantApiKeyEntity } from "../domain/entities/tenant-api-key.entity";
import type { TenantRole } from "@prisma/client";
import type { TenantAuthContext, TenantApiKeyAuthContext } from "../../../shared/types";
import { HttpStatus } from "../../../shared/constants/http-status";

class InMemoryTenantApiKeyRepository implements ITenantApiKeyRepository {
  private keys: TenantApiKeyEntity[] = [];
  public tenants: Record<string, { id: string; name: string; isActive: boolean }> = {
    "tenant-alpha": { id: "tenant-alpha", name: "Tenant Alpha", isActive: true },
    "tenant-beta": { id: "tenant-beta", name: "Tenant Beta", isActive: true },
    "tenant-inactive": { id: "tenant-inactive", name: "Tenant Inactive", isActive: false },
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
    return (
      this.keys.find((k) => k.id === id && k.tenantId === tenantId) || null
    );
  }

  async listByTenantId(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ items: TenantApiKeyEntity[]; total: number }> {
    const matching = this.keys.filter((k) => k.tenantId === tenantId);
    const start = (page - 1) * limit;
    const items = matching.slice(start, start + limit);
    return { items, total: matching.length };
  }

  async deleteByIdAndTenantId(id: string, tenantId: string): Promise<boolean> {
    const index = this.keys.findIndex(
      (k) => k.id === id && k.tenantId === tenantId,
    );
    if (index === -1) return false;
    this.keys.splice(index, 1);
    return true;
  }

  async updateLastAccessedAt(id: string, timestamp: Date): Promise<void> {
    const key = this.keys.find((k) => k.id === id);
    if (key) {
      key.lastAccessedAt = timestamp;
    }
  }

  clear() {
    this.keys = [];
  }
}

describe("Tenant API Key Integration Suite", () => {
  let app: express.Express;
  let repo: InMemoryTenantApiKeyRepository;
  let currentAuthUser: TenantAuthContext | null;

  beforeEach(() => {
    repo = new InMemoryTenantApiKeyRepository();
    const cryptoService = new ApiKeyCryptoService();

    const createUseCase = new CreateTenantApiKeyUseCase(repo, cryptoService);
    const listUseCase = new ListTenantApiKeysUseCase(repo);
    const deleteUseCase = new DeleteTenantApiKeyUseCase(repo);
    const verifyUseCase = new VerifyTenantApiKeyUseCase(repo, cryptoService);

    const controller = new TenantApiKeyController(
      createUseCase,
      listUseCase,
      deleteUseCase,
    );

    const apiKeyAuth = new TenantApiKeyAuthMiddleware(verifyUseCase);

    // Mock Authenticate & Authorize middleware for deterministic tenant session testing
    currentAuthUser = {
      type: "tenant",
      userId: "user-alpha-owner",
      email: "owner@alpha.com",
      membershipId: "mem-1",
      tenantId: "tenant-alpha",
      tenantRole: "OWNER",
      isPlatformAdmin: false,
    };

    const mockAuthenticate = {
      tenant: () => (req: Request, res: Response, next: express.NextFunction) => {
        if (!currentAuthUser) {
          return res.status(401).json({ success: false, error: "Authentication token not provided" });
        }
        (req as Request & { user: TenantAuthContext }).user = currentAuthUser;
        next();
      },
    } as any;

    const mockAuthorize = {
      tenantRoles:
        (...allowed: TenantRole[]) =>
        (req: Request, res: Response, next: express.NextFunction) => {
          const user = (req as Request & { user: TenantAuthContext }).user;
          if (!user || !allowed.includes(user.tenantRole)) {
            return res.status(403).json({ success: false, error: "You do not have permission to perform this action" });
          }
          next();
        },
    } as any;

    app = express();
    app.use(express.json());

    // 1. Mount API Key Management Routes at /v1/api-keys
    app.use(
      "/v1/api-keys",
      buildTenantApiKeyRoutes(controller, mockAuthenticate, mockAuthorize),
    );

    // 2. Mount Designated External Integration Route protected by X-API-Key
    app.post(
      "/v1/public/integration/leads",
      apiKeyAuth.authenticate(),
      (req: Request, res: Response) => {
        const user = (req as Request & { user: TenantApiKeyAuthContext }).user;
        res.status(200).json({
          success: true,
          message: "Lead ingested successfully via API Key",
          context: {
            authType: user.authType,
            tenantId: user.tenantId,
            apiKeyId: user.apiKeyId,
            keyIdentifier: user.keyIdentifier,
          },
        });
      },
    );

    // Error handler
    const mockLogger = {
      warn: () => {},
      error: () => {},
      info: () => {},
      child: () => mockLogger,
    } as any;
    app.use(createErrorHandler(mockLogger));
  });

  describe("API Key Creation: POST /v1/api-keys", () => {
    it("should allow OWNER to create API key and return complete key once", async () => {
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-owner",
        email: "owner@alpha.com",
        membershipId: "mem-1",
        tenantId: "tenant-alpha",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };

      const res = await request(app).post("/v1/api-keys");

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keyIdentifier).toMatch(/^ki-[0-9a-f-]+$/i);
      expect(res.body.data.fullKey).toMatch(/^ki-[0-9a-f-]+\.sec_[0-9a-f]{64}$/i);
      expect(res.body.data.createdBy.email).toBe("user-alpha-owner@test.com");

      // Verify secretHash is NEVER exposed in the response
      expect(res.body.data.secretHash).toBeUndefined();
    });

    it("should allow ADMIN to create API key", async () => {
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-admin",
        email: "admin@alpha.com",
        membershipId: "mem-2",
        tenantId: "tenant-alpha",
        tenantRole: "ADMIN",
        isPlatformAdmin: false,
      };

      const res = await request(app).post("/v1/api-keys");

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.success).toBe(true);
    });

    it("should deny ordinary USER role with 403 Forbidden", async () => {
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-viewer",
        email: "user@alpha.com",
        membershipId: "mem-3",
        tenantId: "tenant-alpha",
        tenantRole: "USER",
        isPlatformAdmin: false,
      };

      const res = await request(app).post("/v1/api-keys");

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.success).toBe(false);
    });

    it("should succeed creating key even if empty body is sent", async () => {
      const res = await request(app)
        .post("/v1/api-keys")
        .send({});

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keyIdentifier).toMatch(/^ki-[0-9a-f-]+$/i);
    });
  });

  describe("API Key Listing: GET /v1/api-keys", () => {
    it("should list tenant API keys with masked key representation and pagination", async () => {
      // Create two keys for tenant-alpha
      await request(app).post("/v1/api-keys");
      await request(app).post("/v1/api-keys");

      const res = await request(app).get("/v1/api-keys?page=1&limit=10");

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.items[0].maskedKey).toMatch(/^ki-[0-9a-f-]+\.sec_••••••••$/);
      expect(res.body.data.items[1].maskedKey).toMatch(/^ki-[0-9a-f-]+\.sec_••••••••$/);
      expect(res.body.data.pagination.total).toBe(2);

      // Verify no plain fullKey or secretHash leaks
      expect(res.body.data.items[0].fullKey).toBeUndefined();
      expect(res.body.data.items[0].secretHash).toBeUndefined();
    });

    it("should deny ordinary USER role from listing keys", async () => {
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-viewer",
        email: "user@alpha.com",
        membershipId: "mem-3",
        tenantId: "tenant-alpha",
        tenantRole: "USER",
        isPlatformAdmin: false,
      };

      const res = await request(app).get("/v1/api-keys");
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe("Cross-Tenant Security Isolation", () => {
    it("should enforce tenant isolation so Tenant Beta cannot see Tenant Alpha keys", async () => {
      // 1. Create key as Tenant Alpha
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-owner",
        email: "owner@alpha.com",
        membershipId: "mem-1",
        tenantId: "tenant-alpha",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };
      await request(app).post("/v1/api-keys");

      // 2. Switch to Tenant Beta
      currentAuthUser = {
        type: "tenant",
        userId: "user-beta-owner",
        email: "owner@beta.com",
        membershipId: "mem-2",
        tenantId: "tenant-beta",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };

      const res = await request(app).get("/v1/api-keys");
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.items.length).toBe(0);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it("should prevent Tenant Beta from deleting Tenant Alpha key", async () => {
      // 1. Create key as Tenant Alpha
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-owner",
        email: "owner@alpha.com",
        membershipId: "mem-1",
        tenantId: "tenant-alpha",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };
      const createRes = await request(app).post("/v1/api-keys");
      const alphaKeyId = createRes.body.data.id;

      // 2. Switch to Tenant Beta and attempt to delete Alpha's key
      currentAuthUser = {
        type: "tenant",
        userId: "user-beta-owner",
        email: "owner@beta.com",
        membershipId: "mem-2",
        tenantId: "tenant-beta",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };

      const deleteRes = await request(app).delete(`/v1/api-keys/${alphaKeyId}`);
      expect(deleteRes.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe("API Key Verification Middleware & Immediate Revocation", () => {
    it("should authenticate external request with valid X-API-Key and populate context", async () => {
      // 1. Generate key for Tenant Alpha
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-owner",
        email: "owner@alpha.com",
        membershipId: "mem-1",
        tenantId: "tenant-alpha",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };
      const createRes = await request(app).post("/v1/api-keys");
      const fullKey = createRes.body.data.fullKey;

      // 2. Make external call with X-API-Key header
      const webhookRes = await request(app)
        .post("/v1/public/integration/leads")
        .set("X-API-Key", fullKey)
        .send({ leadName: "John Prospect" });

      expect(webhookRes.status).toBe(HttpStatus.OK);
      expect(webhookRes.body.success).toBe(true);
      expect(webhookRes.body.context.tenantId).toBe("tenant-alpha");
      expect(webhookRes.body.context.authType).toBe("api_key");
      expect(webhookRes.body.context.apiKeyId).toBe(createRes.body.data.id);
    });

    it("should reject external request when X-API-Key is missing", async () => {
      const res = await request(app)
        .post("/v1/public/integration/leads")
        .send({ leadName: "John Prospect" });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error).toContain("API key not provided");
    });

    it("should reject external request when API key is sent via Authorization: Bearer instead of X-API-Key", async () => {
      const res = await request(app)
        .post("/v1/public/integration/leads")
        .set("Authorization", "Bearer ki-1234.sec_abcd")
        .send({ leadName: "John Prospect" });

      // Strict policy: must use X-API-Key for external API keys
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error).toContain("API key not provided in X-API-Key header");
    });

    it("should reject invalid or tampered secret", async () => {
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-owner",
        email: "owner@alpha.com",
        membershipId: "mem-1",
        tenantId: "tenant-alpha",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };
      const createRes = await request(app).post("/v1/api-keys");
      const fullKey = createRes.body.data.fullKey;

      const tamperedKey = `${fullKey.slice(0, -4)}ffff`;
      const res = await request(app)
        .post("/v1/public/integration/leads")
        .set("X-API-Key", tamperedKey)
        .send({ leadName: "John Prospect" });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error).toContain("Invalid or revoked API key");
    });

    it("should immediately revoke credentials when key is deleted", async () => {
      // 1. Create key
      currentAuthUser = {
        type: "tenant",
        userId: "user-alpha-owner",
        email: "owner@alpha.com",
        membershipId: "mem-1",
        tenantId: "tenant-alpha",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };
      const createRes = await request(app).post("/v1/api-keys");
      const keyId = createRes.body.data.id;
      const fullKey = createRes.body.data.fullKey;

      // 2. Verify external call succeeds
      const call1 = await request(app)
        .post("/v1/public/integration/leads")
        .set("X-API-Key", fullKey)
        .send({});
      expect(call1.status).toBe(HttpStatus.OK);

      // 3. Delete key
      const deleteRes = await request(app).delete(`/v1/api-keys/${keyId}`);
      expect(deleteRes.status).toBe(HttpStatus.OK);

      // 4. Immediately subsequent call fails with 401 Unauthorized
      const call2 = await request(app)
        .post("/v1/public/integration/leads")
        .set("X-API-Key", fullKey)
        .send({});
      expect(call2.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(call2.body.error).toContain("Invalid or revoked API key");
    });

    it("should reject API key when tenant account is inactive with 403 Forbidden", async () => {
      // 1. Create key under inactive tenant
      currentAuthUser = {
        type: "tenant",
        userId: "user-inactive-owner",
        email: "owner@inactive.com",
        membershipId: "mem-inactive",
        tenantId: "tenant-inactive",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      };
      const createRes = await request(app).post("/v1/api-keys");
      const fullKey = createRes.body.data.fullKey;

      // 2. Call external API with inactive tenant's key
      const res = await request(app)
        .post("/v1/public/integration/leads")
        .set("X-API-Key", fullKey)
        .send({});

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error).toContain("Tenant account is inactive");
    });
  });
});
