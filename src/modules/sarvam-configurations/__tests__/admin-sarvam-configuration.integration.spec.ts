import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { buildAdminSarvamConfigurationRoutes } from "../presentation/admin-sarvam-configuration.routes";
import { AdminSarvamConfigurationController } from "../presentation/admin-sarvam-configuration.controller";
import { CreateSarvamConfigurationUseCase } from "../application/use-cases/create-sarvam-configuration.use-case";
import { UpdateSarvamConfigurationUseCase } from "../application/use-cases/update-sarvam-configuration.use-case";
import { GetSarvamConfigurationUseCase } from "../application/use-cases/get-sarvam-configuration.use-case";
import { ListSarvamConfigurationsUseCase } from "../application/use-cases/list-sarvam-configurations.use-case";
import { DeleteSarvamConfigurationUseCase } from "../application/use-cases/delete-sarvam-configuration.use-case";
import { AesSarvamEncryptionService } from "../infrastructure/services/aes-sarvam-encryption.service";
import { SarvamConfigurationMapper } from "../application/mappers/sarvam-configuration.mapper";
import { createErrorHandler } from "../../../shared/middleware/error-handler";
import type {
  ISarvamConfigurationRepository,
  SarvamConfigurationWithTenant,
  CreateSarvamConfigurationRecord,
  UpdateSarvamConfigurationRecord,
  ListSarvamConfigurationFilter,
} from "../application/interfaces/sarvam-configuration-repository.interface";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { HttpStatus } from "../../../shared/constants/http-status";
import type { Logger } from "../../../shared/logging/logger.interface";

const VALID_TENANT_ID_1 = "c6abe787-cac3-4383-a90d-d7853092e436";
const VALID_TENANT_ID_2 = "14008142-d8cd-4b08-9e2b-7647f1e4b7af";
const NON_EXISTENT_TENANT_ID = "6be38d46-ff31-465e-a514-909ed4386d07";

class InMemorySarvamConfigurationRepository
  implements ISarvamConfigurationRepository
{
  public records: SarvamConfigurationWithTenant[] = [];
  public existingTenants = new Set<string>([
    VALID_TENANT_ID_1,
    VALID_TENANT_ID_2,
  ]);

  async create(
    data: CreateSarvamConfigurationRecord,
  ): Promise<SarvamConfigurationWithTenant> {
    const record: SarvamConfigurationWithTenant = {
      id: `sarvam-cfg-${this.records.length + 1}`,
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
    data: UpdateSarvamConfigurationRecord,
  ): Promise<SarvamConfigurationWithTenant> {
    const index = this.records.findIndex((r) => r.id === id);
    if (index === -1) throw new Error("Record not found");

    const existing = this.records[index];
    const updated: SarvamConfigurationWithTenant = {
      ...existing,
      ...(data.apiKeyEncrypted !== undefined && {
        apiKeyEncrypted: data.apiKeyEncrypted,
      }),
      ...(data.workspaceId !== undefined && { workspaceId: data.workspaceId }),
      ...(data.organizationId !== undefined && {
        organizationId: data.organizationId,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      updatedBy: data.updatedBy,
      updatedAt: new Date(),
    };
    this.records[index] = updated;
    return updated;
  }

  async findById(id: string): Promise<SarvamConfigurationWithTenant | null> {
    return this.records.find((r) => r.id === id) || null;
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<SarvamConfigurationWithTenant | null> {
    return this.records.find((r) => r.tenantId === tenantId) || null;
  }

  async list(filter: ListSarvamConfigurationFilter): Promise<{
    items: SarvamConfigurationWithTenant[];
    total: number;
  }> {
    let filtered = [...this.records];
    if (filter.tenantId) {
      filtered = filtered.filter((r) => r.tenantId === filter.tenantId);
    }
    if (filter.isActive !== undefined) {
      filtered = filtered.filter((r) => r.isActive === filter.isActive);
    }
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const start = (page - 1) * limit;
    return {
      items: filtered.slice(start, start + limit),
      total: filtered.length,
    };
  }

  async delete(id: string): Promise<void> {
    this.records = this.records.filter((r) => r.id !== id);
  }

  async existsForTenant(tenantId: string): Promise<boolean> {
    return this.records.some((r) => r.tenantId === tenantId);
  }

  async tenantExists(tenantId: string): Promise<boolean> {
    return this.existingTenants.has(tenantId);
  }
}

describe("Admin Sarvam Configuration Integration", () => {
  let app: express.Express;
  let repo: InMemorySarvamConfigurationRepository;
  let encryptionService: AesSarvamEncryptionService;
  let currentUser: { userId: string; isPlatformAdmin: boolean } | null = null;

  const mockLogger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    repo = new InMemorySarvamConfigurationRepository();
    encryptionService = new AesSarvamEncryptionService(
      "test-sarvam-secret-at-least-32-chars-long",
    );
    const mapper = new SarvamConfigurationMapper(encryptionService);

    const createUseCase = new CreateSarvamConfigurationUseCase(
      repo,
      encryptionService,
      mapper,
      mockLogger,
    );
    const updateUseCase = new UpdateSarvamConfigurationUseCase(
      repo,
      encryptionService,
      mapper,
      mockLogger,
    );
    const getUseCase = new GetSarvamConfigurationUseCase(repo, mapper);
    const listUseCase = new ListSarvamConfigurationsUseCase(repo, mapper);
    const deleteUseCase = new DeleteSarvamConfigurationUseCase(repo, mockLogger);

    const controller = new AdminSarvamConfigurationController(
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
        (req as any).user = currentUser;
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

    const routes = buildAdminSarvamConfigurationRoutes(
      controller,
      fakeAuthMiddleware,
      fakeAuthorizeMiddleware,
    );
    app.use("/v1/admin/sarvam-configurations", routes);
    app.use("/platform-admin/sarvam-configurations", routes);
    app.use(createErrorHandler(mockLogger));

    currentUser = { userId: "admin-user-id", isPlatformAdmin: true };
  });

  describe("Authentication & Authorization", () => {
    it("should return 401 Unauthorized when no user is authenticated", async () => {
      currentUser = null;
      const res = await request(app).get("/v1/admin/sarvam-configurations");
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it("should return 403 Forbidden when user is not a platform admin", async () => {
      currentUser = { userId: "normal-user", isPlatformAdmin: false };
      const res = await request(app).get("/v1/admin/sarvam-configurations");
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe("CRUD Flow & Security", () => {
    it("should create configuration and never return raw API key in response", async () => {
      const res = await request(app)
        .post("/v1/admin/sarvam-configurations")
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

    it("should reject creation if tenant does not exist", async () => {
      const res = await request(app)
        .post("/v1/admin/sarvam-configurations")
        .send({
          tenantId: NON_EXISTENT_TENANT_ID,
          apiKey: "sk_test_key_1234",
          workspaceId: "wrk-1",
          organizationId: "org-1",
        });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.success).toBe(false);
    });

    it("should prevent duplicate configurations for the same tenant (409 Conflict)", async () => {
      await request(app).post("/v1/admin/sarvam-configurations").send({
        tenantId: VALID_TENANT_ID_1,
        apiKey: "sk_initial_key_1111",
        workspaceId: "wrk-1",
        organizationId: "org-1",
      });

      const duplicateRes = await request(app)
        .post("/v1/admin/sarvam-configurations")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_another_key_2222",
          workspaceId: "wrk-2",
          organizationId: "org-2",
        });

      expect(duplicateRes.status).toBe(HttpStatus.CONFLICT);
      expect(duplicateRes.body.success).toBe(false);
    });

    it("should update workspaceId while preserving existing API key when apiKey is omitted", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-configurations")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_original_key_1234",
          workspaceId: "wrk-initial",
          organizationId: "org-initial",
        });

      const configId = createRes.body.data.id;

      // Update without apiKey
      const patchRes = await request(app)
        .patch(`/v1/admin/sarvam-configurations/${configId}`)
        .send({
          workspaceId: "wrk-updated",
        });

      expect(patchRes.status).toBe(HttpStatus.OK);
      expect(patchRes.body.data.workspaceId).toBe("wrk-updated");
      expect(patchRes.body.data.maskedApiKey).toBe("sk_••••••••1234");

      // Verify stored key was preserved
      const stored = await repo.findById(configId);
      expect(encryptionService.decrypt(stored!.apiKeyEncrypted)).toBe(
        "sk_live_original_key_1234",
      );
    });

    it("should update API key when a new non-empty apiKey is provided in update", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-configurations")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_first_key_1111",
          workspaceId: "wrk-1",
          organizationId: "org-1",
        });

      const configId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/v1/admin/sarvam-configurations/${configId}`)
        .send({
          apiKey: "sk_live_second_key_2222",
        });

      expect(patchRes.status).toBe(HttpStatus.OK);
      expect(patchRes.body.data.maskedApiKey).toBe("sk_••••••••2222");

      const stored = await repo.findById(configId);
      expect(encryptionService.decrypt(stored!.apiKeyEncrypted)).toBe(
        "sk_live_second_key_2222",
      );
    });

    it("should delete configuration and return 404 on subsequent get", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-configurations")
        .send({
          tenantId: VALID_TENANT_ID_1,
          apiKey: "sk_live_delete_test_5555",
          workspaceId: "wrk-del",
          organizationId: "org-del",
        });

      const configId = createRes.body.data.id;

      const deleteRes = await request(app).delete(
        `/v1/admin/sarvam-configurations/${configId}`,
      );
      expect(deleteRes.status).toBe(HttpStatus.OK);

      const getRes = await request(app).get(
        `/v1/admin/sarvam-configurations/${configId}`,
      );
      expect(getRes.status).toBe(HttpStatus.NOT_FOUND);
    });

    it("should respond identically when invoked via the alias /platform-admin/sarvam-configurations", async () => {
      const res = await request(app).get(
        "/platform-admin/sarvam-configurations",
      );
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });
  });
});
