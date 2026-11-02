import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { buildAdminSarvamApiKeyRoutes } from "../presentation/admin-sarvam-api-key.routes";
import { AdminSarvamApiKeyController } from "../presentation/admin-sarvam-api-key.controller";
import { CreateSarvamApiKeyUseCase } from "../application/use-cases/create-sarvam-api-key.use-case";
import { UpdateSarvamApiKeyUseCase } from "../application/use-cases/update-sarvam-api-key.use-case";
import { GetSarvamApiKeyUseCase } from "../application/use-cases/get-sarvam-api-key.use-case";
import { ListSarvamApiKeysUseCase } from "../application/use-cases/list-sarvam-api-keys.use-case";
import { DeleteSarvamApiKeyUseCase } from "../application/use-cases/delete-sarvam-api-key.use-case";
import { AesSarvamEncryptionService } from "../infrastructure/services/aes-sarvam-encryption.service";
import { SarvamApiKeyMapper } from "../application/mappers/sarvam-api-key.mapper";
import { createErrorHandler } from "../../../shared/middleware/error-handler";
import type {
  ISarvamApiKeyRepository,
  SarvamApiKeyWithTenant,
  CreateSarvamApiKeyRecord,
  UpdateSarvamApiKeyRecord,
  ListSarvamApiKeyFilter,
} from "../application/interfaces/sarvam-api-key-repository.interface";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { HttpStatus } from "../../../shared/constants/http-status";
import type { Logger } from "../../../shared/logging/logger.interface";

const VALID_TENANT_ID_1 = "c6abe787-cac3-4383-a90d-d7853092e436";
const VALID_TENANT_ID_2 = "14008142-d8cd-4b08-9e2b-7647f1e4b7af";
const NON_EXISTENT_TENANT_ID = "6be38d46-ff31-465e-a514-909ed4386d07";

class InMemorySarvamApiKeyRepository implements ISarvamApiKeyRepository {
  public records: SarvamApiKeyWithTenant[] = [];
  public existingTenants = new Set<string>([
    VALID_TENANT_ID_1,
    VALID_TENANT_ID_2,
  ]);

  async create(
    data: CreateSarvamApiKeyRecord,
  ): Promise<SarvamApiKeyWithTenant> {
    const record: SarvamApiKeyWithTenant = {
      id: `sarvam-key-${this.records.length + 1}`,
      tenantId: data.tenantId,
      apiKeyEncrypted: data.apiKeyEncrypted,
      workspaceId: data.workspaceId,
      organizationId: data.organizationId,
      isActive: data.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy,
      updatedBy: null,
      tenant: {
        id: data.tenantId,
        name: `Tenant ${data.tenantId}`,
        email: `${data.tenantId}@example.com`,
        isActive: true,
      },
    };
    this.records.push(record);
    return record;
  }

  async update(
    id: string,
    data: UpdateSarvamApiKeyRecord,
  ): Promise<SarvamApiKeyWithTenant> {
    const index = this.records.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error("Not found");
    }
    const current = this.records[index];
    const updated: SarvamApiKeyWithTenant = {
      ...current,
      apiKeyEncrypted: data.apiKeyEncrypted ?? current.apiKeyEncrypted,
      workspaceId:
        data.workspaceId !== undefined ? data.workspaceId : current.workspaceId,
      organizationId:
        data.organizationId !== undefined
          ? data.organizationId
          : current.organizationId,
      isActive: data.isActive !== undefined ? data.isActive : current.isActive,
      updatedAt: new Date(),
      updatedBy: data.updatedBy ?? current.updatedBy,
    };
    this.records[index] = updated;
    return updated;
  }

  async findById(id: string): Promise<SarvamApiKeyWithTenant | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<SarvamApiKeyWithTenant | null> {
    return this.records.find((r) => r.tenantId === tenantId) ?? null;
  }

  async list(filter: ListSarvamApiKeyFilter): Promise<{
    items: SarvamApiKeyWithTenant[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    let filtered = [...this.records];
    if (filter.tenantId) {
      filtered = filtered.filter((r) => r.tenantId === filter.tenantId);
    }
    if (filter.isActive !== undefined) {
      filtered = filtered.filter((r) => r.isActive === filter.isActive);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.tenant.name.toLowerCase().includes(q) ||
          (r.workspaceId && r.workspaceId.toLowerCase().includes(q)) ||
          (r.organizationId && r.organizationId.toLowerCase().includes(q)),
      );
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return { items, total, page, limit, totalPages };
  }

  async delete(id: string): Promise<void> {
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx !== -1) {
      this.records.splice(idx, 1);
    }
  }

  async existsForTenant(tenantId: string): Promise<boolean> {
    return this.records.some((r) => r.tenantId === tenantId);
  }

  async tenantExists(tenantId: string): Promise<boolean> {
    return this.existingTenants.has(tenantId);
  }
}

describe("AdminSarvamApiKey API Integration", () => {
  let app: express.Express;
  let repo: InMemorySarvamApiKeyRepository;
  let encryptionService: AesSarvamEncryptionService;
  let currentUser: { userId: string; isPlatformAdmin: boolean } | null;

  const mockLogger: Logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    repo = new InMemorySarvamApiKeyRepository();
    encryptionService = new AesSarvamEncryptionService(
      "test-secret-key-32-chars-length!",
    );
    const mapper = new SarvamApiKeyMapper(encryptionService);

    const createUseCase = new CreateSarvamApiKeyUseCase(
      repo,
      encryptionService,
      mapper,
      mockLogger,
    );
    const updateUseCase = new UpdateSarvamApiKeyUseCase(
      repo,
      encryptionService,
      mapper,
      mockLogger,
    );
    const getUseCase = new GetSarvamApiKeyUseCase(repo, mapper);
    const listUseCase = new ListSarvamApiKeysUseCase(repo, mapper);
    const deleteUseCase = new DeleteSarvamApiKeyUseCase(repo, mockLogger);

    const controller = new AdminSarvamApiKeyController(
      createUseCase,
      updateUseCase,
      getUseCase,
      listUseCase,
      deleteUseCase,
    );

    const fakeAuthMiddleware = {
      admin: () => (req: Request, res: Response, next: NextFunction) => {
        if (!currentUser) {
          res.status(HttpStatus.UNAUTHORIZED).json({
            success: false,
            error: "Authentication required",
          });
          return;
        }
        (req as unknown as { user: unknown }).user = currentUser;
        next();
      },
    } as unknown as AuthenticateMiddleware;

    const fakeAuthorizeMiddleware = {
      platformAdmin: () => (req: Request, res: Response, next: NextFunction) => {
        if (!currentUser?.isPlatformAdmin) {
          res.status(HttpStatus.FORBIDDEN).json({
            success: false,
            error: "Platform admin access required",
          });
          return;
        }
        next();
      },
    } as unknown as AuthorizeMiddleware;

    app = express();
    app.use(express.json());

    const routes = buildAdminSarvamApiKeyRoutes(
      controller,
      fakeAuthMiddleware,
      fakeAuthorizeMiddleware,
    );
    app.use("/v1/admin/sarvam-api-keys", routes);
    app.use("/platform-admin/sarvam-api-keys", routes);
    app.use("/v1/admin/sarvam-configurations", routes);
    app.use("/platform-admin/sarvam-configurations", routes);
    app.use(createErrorHandler(mockLogger));

    currentUser = { userId: "admin-user-id", isPlatformAdmin: true };
  });

  describe("Authentication & Authorization", () => {
    it("should return 401 Unauthorized when no user is authenticated", async () => {
      currentUser = null;
      const res = await request(app).get("/v1/admin/sarvam-api-keys");
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it("should return 403 Forbidden when user is not a platform admin", async () => {
      currentUser = { userId: "normal-user", isPlatformAdmin: false };
      const res = await request(app).get("/v1/admin/sarvam-api-keys");
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe("CRUD Flow & Security", () => {
    it("should create key and never return raw API key in response", async () => {
      const res = await request(app)
        .post("/v1/admin/sarvam-api-keys")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_very_secret_api_key_8888",
          workspaceId: "wrk_sarvam_1",
          organizationId: "org_sarvam_1",
          isActive: true,
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.tenantId).toBe(VALID_TENANT_ID_1);
      expect(res.body.data.maskedApiKey).toBe("sk_••••••••8888");
      expect(res.body.data).not.toHaveProperty("apiKey");
      expect(res.body.data).not.toHaveProperty("apiKeyEncrypted");

      // Verify at rest in repository: key is encrypted
      const stored = await repo.findByTenantId(VALID_TENANT_ID_1);
      expect(stored?.apiKeyEncrypted).not.toContain("very_secret");
      expect(encryptionService.decrypt(stored!.apiKeyEncrypted)).toBe(
        "sk_live_very_secret_api_key_8888",
      );
    });

    it("should return 404 when creating for a non-existent tenant", async () => {
      const res = await request(app)
        .post("/v1/admin/sarvam-api-keys")
        .send({
          tenantId: NON_EXISTENT_TENANT_ID,
          apiKey: "sk_live_key_12345",
          workspaceId: "wrk_1",
          organizationId: "org_1",
        });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.success).toBe(false);
    });

    it("should return 409 when creating duplicate key for the same tenant", async () => {
      // First creation
      await request(app).post("/v1/admin/sarvam-api-keys").send({
        tenantId: VALID_TENANT_ID_1,
        apiKey: "sk_live_first_key_1111",
        workspaceId: "wrk_1",
        organizationId: "org_1",
      });

      // Duplicate attempt
      const res = await request(app).post("/v1/admin/sarvam-api-keys").send({
        tenantId: VALID_TENANT_ID_1,
        apiKey: "sk_live_second_key_2222",
        workspaceId: "wrk_1",
        organizationId: "org_1",
      });

      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(res.body.success).toBe(false);
    });

    it("should return 422 when payload validation fails", async () => {
      const res = await request(app).post("/v1/admin/sarvam-api-keys").send({
        tenantId: "not-a-valid-uuid",
        apiKey: "",
      });

      expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.success).toBe(false);
    });

    it("should list keys with pagination and tenant details", async () => {
      await request(app).post("/v1/admin/sarvam-api-keys").send({
        tenantId: VALID_TENANT_ID_1,
        apiKey: "sk_live_key_11111111",
        workspaceId: "wrk_1",
        organizationId: "org_1",
      });
      await request(app).post("/v1/admin/sarvam-api-keys").send({
        tenantId: VALID_TENANT_ID_2,
        apiKey: "sk_live_key_22222222",
        workspaceId: "wrk_2",
        organizationId: "org_2",
      });

      const res = await request(app)
        .get("/v1/admin/sarvam-api-keys")
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.items[0].maskedApiKey).toBeDefined();
      expect(res.body.data.items[0].tenantName).toBeDefined();
    });

    it("should get single key by id without returning plain api key", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-api-keys")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_super_secret_key_4444",
          workspaceId: "wrk_1",
          organizationId: "org_1",
        });

      const id = createRes.body.data.id;

      const res = await request(app).get(`/v1/admin/sarvam-api-keys/${id}`);
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.maskedApiKey).toBe("sk_••••••••4444");
      expect(res.body.data).not.toHaveProperty("apiKey");
      expect(res.body.data).not.toHaveProperty("apiKeyEncrypted");
    });

    it("should preserve existing api key when apiKey is empty/undefined on update", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-api-keys")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_original_key_5555",
          workspaceId: "old_wrk",
          organizationId: "org_1",
        });

      const id = createRes.body.data.id;

      // Update without apiKey
      const updateRes = await request(app)
        .patch(`/v1/admin/sarvam-api-keys/${id}`)
        .send({
          workspaceId: "new_wrk",
        });

      expect(updateRes.status).toBe(HttpStatus.OK);
      expect(updateRes.body.data.workspaceId).toBe("new_wrk");
      expect(updateRes.body.data.maskedApiKey).toBe("sk_••••••••5555");

      // Verify at rest that the key wasn't corrupted or wiped
      const stored = await repo.findById(id);
      expect(encryptionService.decrypt(stored!.apiKeyEncrypted)).toBe(
        "sk_live_original_key_5555",
      );
    });

    it("should update api key when a new key is provided in update", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-api-keys")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_original_key_5555",
          workspaceId: "wrk_1",
          organizationId: "org_1",
        });

      const id = createRes.body.data.id;

      const updateRes = await request(app)
        .patch(`/v1/admin/sarvam-api-keys/${id}`)
        .send({
          apiKey: "sk_live_brand_new_key_9999",
        });

      expect(updateRes.status).toBe(HttpStatus.OK);
      expect(updateRes.body.data.maskedApiKey).toBe("sk_••••••••9999");

      const stored = await repo.findById(id);
      expect(encryptionService.decrypt(stored!.apiKeyEncrypted)).toBe(
        "sk_live_brand_new_key_9999",
      );
    });

    it("should delete key record and return success", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-api-keys")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_key_to_delete",
          workspaceId: "wrk_1",
          organizationId: "org_1",
        });

      const id = createRes.body.data.id;

      const deleteRes = await request(app).delete(
        `/v1/admin/sarvam-api-keys/${id}`,
      );
      expect(deleteRes.status).toBe(HttpStatus.OK);

      const getRes = await request(app).get(`/v1/admin/sarvam-api-keys/${id}`);
      expect(getRes.status).toBe(HttpStatus.NOT_FOUND);
    });

    it("should support backward compatibility endpoints (/platform-admin/sarvam-configurations)", async () => {
      const res = await request(app)
        .post("/platform-admin/sarvam-configurations")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_compat_key_7777",
          workspaceId: "wrk_compat",
          organizationId: "org_compat",
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.data.maskedApiKey).toBe("sk_••••••••7777");

      const listRes = await request(app).get(
        "/platform-admin/sarvam-configurations",
      );
      expect(listRes.status).toBe(HttpStatus.OK);
      expect(listRes.body.data.items).toHaveLength(1);
    });
  });
});
