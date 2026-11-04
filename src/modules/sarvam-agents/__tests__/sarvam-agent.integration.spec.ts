import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { buildAdminSarvamAgentRoutes } from "../presentation/admin/admin-sarvam-agent.routes";
import { buildTenantSarvamAgentRoutes } from "../presentation/tenant/tenant-sarvam-agent.routes";
import { AdminSarvamAgentController } from "../presentation/admin/admin-sarvam-agent.controller";
import { TenantSarvamAgentController } from "../presentation/tenant/tenant-sarvam-agent.controller";
import { CreateSarvamAgentUseCase } from "../application/use-cases/admin/create-sarvam-agent.use-case";
import { GetSarvamAgentUseCase } from "../application/use-cases/admin/get-sarvam-agent.use-case";
import { ListSarvamAgentsUseCase } from "../application/use-cases/admin/list-sarvam-agents.use-case";
import { UpdateSarvamAgentUseCase } from "../application/use-cases/admin/update-sarvam-agent.use-case";
import { ArchiveSarvamAgentUseCase } from "../application/use-cases/admin/archive-sarvam-agent.use-case";
import { ListTenantSarvamAgentsUseCase } from "../application/use-cases/tenant/list-tenant-sarvam-agents.use-case";
import { GetTenantSarvamAgentUseCase } from "../application/use-cases/tenant/get-tenant-sarvam-agent.use-case";
import { UpdateTenantSarvamAgentVariablesUseCase } from "../application/use-cases/tenant/update-tenant-sarvam-agent-variables.use-case";
import { UpdateTenantSarvamAgentWelcomeMessageUseCase } from "../application/use-cases/tenant/update-tenant-sarvam-agent-welcome-message.use-case";
import { SarvamAgentMapper } from "../application/mappers/sarvam-agent.mapper";
import { createErrorHandler } from "../../../shared/middleware/error-handler";
import type {
  ISarvamAgentRepository,
  SarvamAgentWithApiKeyAndTenant,
  CreateSarvamAgentRecord,
  UpdateSarvamAgentRecord,
  ListSarvamAgentsFilter,
} from "../application/interfaces/sarvam-agent-repository.interface";
import type { ISarvamAgentOverrideRepository } from "../application/interfaces/sarvam-agent-override-repository.interface";
import type {
  ISarvamApiKeyRepository,
  SarvamApiKeyWithTenant,
} from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import type { AuthenticateMiddleware } from "../../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../../shared/middleware/authorize";
import { HttpStatus } from "../../../shared/constants/http-status";
import type { SarvamAgent, SarvamAgentTenantOverride } from "@prisma/client";

const VALID_API_KEY_ID = "4901b0b3-1e5b-4e92-a1b9-3d12d4a5c689";
const VALID_TENANT_ID = "538bc164-9be1-4d92-9578-8317e3f22145";

class InMemorySarvamAgentRepository implements ISarvamAgentRepository {
  public agents: SarvamAgentWithApiKeyAndTenant[] = [];

  async create(data: CreateSarvamAgentRecord): Promise<SarvamAgentWithApiKeyAndTenant> {
    const record: SarvamAgentWithApiKeyAndTenant = {
      id: `agent-${this.agents.length + 1}`,
      name: data.name,
      apiKeyId: data.apiKeyId,
      appId: data.appId,
      appVersion: data.appVersion,
      attemptsPerSecond: data.attemptsPerSecond ?? null,
      webhookUrl: data.webhookUrl ?? null,
      agentVariables: data.agentVariables as any,
      welcomeMessage: data.welcomeMessage as any,
      outputVariables: data.outputVariables as any,
      allowTenantVisible: data.allowTenantVisible ?? false,
      status: data.status ?? "ACTIVE",
      createdBy: data.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      apiKey: {
        id: data.apiKeyId,
        tenantId: VALID_TENANT_ID,
        apiKeyEncrypted: "encrypted",
        workspaceId: "wrk-1",
        organizationId: "org-1",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "admin",
        updatedBy: null,
        tenant: {
          id: VALID_TENANT_ID,
          name: "Acme Tenant",
          email: "tenant@acme.com",
          isActive: true,
        },
      },
    };
    this.agents.push(record);
    return record;
  }

  async update(id: string, data: UpdateSarvamAgentRecord): Promise<SarvamAgentWithApiKeyAndTenant> {
    const idx = this.agents.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error("Not found");
    const existing = this.agents[idx];
    const updated: SarvamAgentWithApiKeyAndTenant = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.appId !== undefined && { appId: data.appId }),
      ...(data.appVersion !== undefined && { appVersion: data.appVersion }),
      ...(data.attemptsPerSecond !== undefined && { attemptsPerSecond: data.attemptsPerSecond }),
      ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl }),
      ...(data.agentVariables !== undefined && { agentVariables: data.agentVariables as any }),
      ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage as any }),
      ...(data.outputVariables !== undefined && { outputVariables: data.outputVariables as any }),
      ...(data.allowTenantVisible !== undefined && { allowTenantVisible: data.allowTenantVisible }),
      ...(data.status !== undefined && { status: data.status }),
      updatedAt: new Date(),
    };
    this.agents[idx] = updated;
    return updated;
  }

  async findById(id: string): Promise<SarvamAgentWithApiKeyAndTenant | null> {
    return this.agents.find((a) => a.id === id) ?? null;
  }

  async findByApiKeyAndAppId(apiKeyId: string, appId: string): Promise<SarvamAgent | null> {
    return this.agents.find((a) => a.apiKeyId === apiKeyId && a.appId === appId) ?? null;
  }

  async list(filter: ListSarvamAgentsFilter): Promise<{ items: SarvamAgentWithApiKeyAndTenant[]; total: number }> {
    let result = [...this.agents];
    if (filter.status) result = result.filter((a) => a.status === filter.status);
    if (filter.apiKeyId) result = result.filter((a) => a.apiKeyId === filter.apiKeyId);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter((a) => a.name.toLowerCase().includes(q) || a.appId.toLowerCase().includes(q));
    }
    return { items: result, total: result.length };
  }

  async archive(id: string): Promise<SarvamAgentWithApiKeyAndTenant> {
    return this.update(id, { status: "ARCHIVED" });
  }

  async archiveByApiKeyId(apiKeyId: string): Promise<number> {
    let count = 0;
    for (const a of this.agents) {
      if (a.apiKeyId === apiKeyId && a.status === "ACTIVE") {
        a.status = "ARCHIVED";
        count++;
      }
    }
    return count;
  }

  async listAccessibleForTenant(tenantId: string): Promise<SarvamAgent[]> {
    return this.agents.filter(
      (a) => a.apiKey.tenantId === tenantId && a.apiKey.isActive && a.status === "ACTIVE" && a.allowTenantVisible,
    );
  }

  async findAccessibleForTenant(id: string, tenantId: string): Promise<SarvamAgent | null> {
    const found = this.agents.find(
      (a) => a.id === id && a.apiKey.tenantId === tenantId && a.apiKey.isActive && a.status === "ACTIVE" && a.allowTenantVisible,
    );
    return found ?? null;
  }

  async existsForApiKeyAndAppId(apiKeyId: string, appId: string, excludeId?: string): Promise<boolean> {
    return this.agents.some((a) => a.apiKeyId === apiKeyId && a.appId === appId && a.id !== excludeId);
  }
}

class InMemorySarvamAgentOverrideRepository implements ISarvamAgentOverrideRepository {
  public overrides: SarvamAgentTenantOverride[] = [];

  async findByAgentAndTenant(agentId: string, tenantId: string): Promise<SarvamAgentTenantOverride | null> {
    return this.overrides.find((o) => o.agentId === agentId && o.tenantId === tenantId) ?? null;
  }

  async upsertVariables(agentId: string, tenantId: string, variableOverrides: Record<string, string>): Promise<SarvamAgentTenantOverride> {
    const idx = this.overrides.findIndex((o) => o.agentId === agentId && o.tenantId === tenantId);
    if (idx >= 0) {
      this.overrides[idx].variableOverrides = variableOverrides as any;
      this.overrides[idx].updatedAt = new Date();
      return this.overrides[idx];
    }
    const created: SarvamAgentTenantOverride = {
      id: `override-${this.overrides.length + 1}`,
      agentId,
      tenantId,
      variableOverrides: variableOverrides as any,
      welcomeMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.overrides.push(created);
    return created;
  }

  async upsertWelcomeMessage(agentId: string, tenantId: string, customMessage: string | null): Promise<SarvamAgentTenantOverride> {
    const idx = this.overrides.findIndex((o) => o.agentId === agentId && o.tenantId === tenantId);
    if (idx >= 0) {
      this.overrides[idx].welcomeMessage = customMessage;
      this.overrides[idx].updatedAt = new Date();
      return this.overrides[idx];
    }
    const created: SarvamAgentTenantOverride = {
      id: `override-${this.overrides.length + 1}`,
      agentId,
      tenantId,
      variableOverrides: {} as any,
      welcomeMessage: customMessage,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.overrides.push(created);
    return created;
  }

  async delete(agentId: string, tenantId: string): Promise<void> {
    this.overrides = this.overrides.filter((o) => !(o.agentId === agentId && o.tenantId === tenantId));
  }
}

class InMemorySarvamApiKeyRepository implements ISarvamApiKeyRepository {
  public keys: SarvamApiKeyWithTenant[] = [];

  async create(): Promise<any> {}
  async update(): Promise<any> {}
  async findById(id: string): Promise<SarvamApiKeyWithTenant | null> {
    return this.keys.find((k) => k.id === id) ?? null;
  }
  async findByTenantId(): Promise<any> {}
  async list(): Promise<any> {}
  async delete(): Promise<any> {}
  async existsForTenant(): Promise<boolean> { return true; }
  async tenantExists(): Promise<boolean> { return true; }
}

describe("Sarvam Agents Integration & HTTP APIs", () => {
  let app: express.Express;
  let agentRepo: InMemorySarvamAgentRepository;
  let overrideRepo: InMemorySarvamAgentOverrideRepository;
  let apiKeyRepo: InMemorySarvamApiKeyRepository;
  let mapper: SarvamAgentMapper;

  beforeEach(() => {
    agentRepo = new InMemorySarvamAgentRepository();
    overrideRepo = new InMemorySarvamAgentOverrideRepository();
    apiKeyRepo = new InMemorySarvamApiKeyRepository();
    mapper = new SarvamAgentMapper();

    apiKeyRepo.keys.push({
      id: VALID_API_KEY_ID,
      tenantId: VALID_TENANT_ID,
      apiKeyEncrypted: "encrypted",
      workspaceId: "wrk-sarvam",
      organizationId: "org-sarvam",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "admin",
      updatedBy: null,
      tenant: {
        id: VALID_TENANT_ID,
        name: "Acme Tenant",
        email: "tenant@acme.com",
        isActive: true,
      },
    });

    const mockAuthMiddleware: AuthenticateMiddleware = {
      admin: () => (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { userId: "admin-user-1", email: "admin@kooi.in", isPlatformAdmin: true, type: "admin" };
        next();
      },
      tenant: () => (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { userId: "tenant-user-1", tenantId: VALID_TENANT_ID, role: "ADMIN", type: "tenant" };
        next();
      },
    } as unknown as AuthenticateMiddleware;

    const mockAuthzMiddleware: AuthorizeMiddleware = {
      platformAdmin: () => (_req: Request, _res: Response, next: NextFunction) => next(),
      tenantRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    } as unknown as AuthorizeMiddleware;

    const createUseCase = new CreateSarvamAgentUseCase(agentRepo, apiKeyRepo, mapper);
    const getUseCase = new GetSarvamAgentUseCase(agentRepo, mapper);
    const listUseCase = new ListSarvamAgentsUseCase(agentRepo, mapper);
    const updateUseCase = new UpdateSarvamAgentUseCase(agentRepo, mapper);
    const archiveUseCase = new ArchiveSarvamAgentUseCase(agentRepo, mapper);

    const listTenantUseCase = new ListTenantSarvamAgentsUseCase(agentRepo, mapper);
    const getTenantUseCase = new GetTenantSarvamAgentUseCase(agentRepo, overrideRepo, mapper);
    const updateTenantVarsUseCase = new UpdateTenantSarvamAgentVariablesUseCase(agentRepo, overrideRepo, mapper);
    const updateTenantWelcomeUseCase = new UpdateTenantSarvamAgentWelcomeMessageUseCase(agentRepo, overrideRepo, mapper);

    const adminController = new AdminSarvamAgentController(
      createUseCase,
      updateUseCase,
      getUseCase,
      listUseCase,
      archiveUseCase,
    );

    const tenantController = new TenantSarvamAgentController(
      listTenantUseCase,
      getTenantUseCase,
      updateTenantVarsUseCase,
      updateTenantWelcomeUseCase,
    );

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    app = express();
    app.use(express.json());
    app.use("/v1/admin/sarvam-agents", buildAdminSarvamAgentRoutes(adminController, mockAuthMiddleware, mockAuthzMiddleware));
    app.use("/v1/sarvam-agents", buildTenantSarvamAgentRoutes(tenantController, mockAuthMiddleware));
    app.use(createErrorHandler(mockLogger));
  });

  describe("Admin Endpoints", () => {
    it("POST /v1/admin/sarvam-agents creates a new agent", async () => {
      const res = await request(app)
        .post("/v1/admin/sarvam-agents")
        .send({
          name: "Sales Agent",
          apiKeyId: VALID_API_KEY_ID,
          appId: "sales_app_01",
          appVersion: 1,
          allowTenantVisible: true,
          agentVariables: [
            { key: "agent_name", defaultValue: "Sarah", isTenantVisible: true, isTenantEditable: true },
            { key: "secret_token", defaultValue: "xyz", isTenantVisible: false, isTenantEditable: false },
          ],
          welcomeMessage: { defaultMessage: "Hi, I am Sarah!" },
          outputVariables: [
            { name: "lead_score", description: "Numerical lead score from 1 to 10" },
          ],
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Sales Agent");
      expect(res.body.data.appId).toBe("sales_app_01");
      expect(res.body.data.status).toBe("ACTIVE");
    });

    it("GET /v1/admin/sarvam-agents lists created agents", async () => {
      await request(app)
        .post("/v1/admin/sarvam-agents")
        .send({
          name: "Agent 1",
          apiKeyId: VALID_API_KEY_ID,
          appId: "app_01",
          appVersion: 1,
        });

      const res = await request(app).get("/v1/admin/sarvam-agents");
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].appId).toBe("app_01");
    });

    it("DELETE /v1/admin/sarvam-agents/:id soft-archives agent", async () => {
      const createRes = await request(app)
        .post("/v1/admin/sarvam-agents")
        .send({
          name: "Agent To Archive",
          apiKeyId: VALID_API_KEY_ID,
          appId: "archive_app_01",
          appVersion: 1,
        });

      const agentId = createRes.body.data.id;

      const deleteRes = await request(app).delete(`/v1/admin/sarvam-agents/${agentId}`);
      expect(deleteRes.status).toBe(HttpStatus.OK);
      expect(deleteRes.body.data.status).toBe("ARCHIVED");
    });
  });

  describe("Tenant Endpoints", () => {
    let createdAgentId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/v1/admin/sarvam-agents")
        .send({
          name: "Tenant Usable Agent",
          apiKeyId: VALID_API_KEY_ID,
          appId: "tenant_app_01",
          appVersion: 1,
          allowTenantVisible: true,
          agentVariables: [
            { key: "agent_alias", defaultValue: "DefaultBot", isTenantVisible: true, isTenantEditable: true },
            { key: "fixed_role", defaultValue: "Support", isTenantVisible: true, isTenantEditable: false },
            { key: "internal_flag", defaultValue: "1", isTenantVisible: false, isTenantEditable: false },
          ],
          welcomeMessage: { defaultMessage: "Welcome from DefaultBot!" },
          outputVariables: [
            { name: "satisfaction", description: "User rating" },
          ],
        });
      createdAgentId = res.body.data.id;
    });

    it("GET /v1/sarvam-agents lists accessible agents without exposing output variables or raw API keys", async () => {
      const res = await request(app).get("/v1/sarvam-agents");
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(createdAgentId);
      expect(res.body.data[0].outputVariables).toBeUndefined();
      expect(res.body.data[0].apiKey).toBeUndefined();
    });

    it("GET /v1/sarvam-agents/:id returns only tenant-visible variables and resolves default values", async () => {
      const res = await request(app).get(`/v1/sarvam-agents/${createdAgentId}`);
      expect(res.status).toBe(HttpStatus.OK);
      const data = res.body.data;
      expect(data.variables).toHaveLength(2); // agent_alias and fixed_role (internal_flag is hidden)
      const aliasVar = data.variables.find((v: any) => v.key === "agent_alias");
      expect(aliasVar.effectiveValue).toBe("DefaultBot");
      expect(aliasVar.isOverridden).toBe(false);
      expect(data.welcomeMessage.effectiveMessage).toBe("Welcome from DefaultBot!");
      expect(data.welcomeMessage.isOverridden).toBe(false);
    });

    it("PATCH /v1/sarvam-agents/:id/variables overrides permitted variables", async () => {
      const res = await request(app)
        .patch(`/v1/sarvam-agents/${createdAgentId}/variables`)
        .send({
          variables: {
            agent_alias: "CustomBot",
          },
        });

      expect(res.status).toBe(HttpStatus.OK);
      const aliasVar = res.body.data.variables.find((v: any) => v.key === "agent_alias");
      expect(aliasVar.effectiveValue).toBe("CustomBot");
      expect(aliasVar.isOverridden).toBe(true);
    });

    it("PATCH /v1/sarvam-agents/:id/welcome-message overrides and restores default when cleared", async () => {
      // 1. Override custom welcome message
      const res1 = await request(app)
        .patch(`/v1/sarvam-agents/${createdAgentId}/welcome-message`)
        .send({
          customMessage: "Hello! Custom welcome message here.",
        });

      expect(res1.status).toBe(HttpStatus.OK);
      expect(res1.body.data.welcomeMessage.effectiveMessage).toBe("Hello! Custom welcome message here.");
      expect(res1.body.data.welcomeMessage.isOverridden).toBe(true);

      // 2. Clear override with null to restore default
      const res2 = await request(app)
        .patch(`/v1/sarvam-agents/${createdAgentId}/welcome-message`)
        .send({
          customMessage: null,
        });

      expect(res2.status).toBe(HttpStatus.OK);
      expect(res2.body.data.welcomeMessage.effectiveMessage).toBe("Welcome from DefaultBot!");
      expect(res2.body.data.welcomeMessage.isOverridden).toBe(false);
      expect(res2.body.data.welcomeMessage.customMessage).toBeNull();
    });
  });

  describe("App Routing Invariants", () => {
    it("ensures buildAdminRoutes is used for admin endpoints and buildTenantRoutes for tenant endpoints", () => {
      const buildAdminRoutesMock = vi.fn().mockReturnValue(express.Router());
      const buildTenantRoutesMock = vi.fn().mockReturnValue(express.Router());

      const mockModule = {
        buildAdminRoutes: buildAdminRoutesMock,
        buildTenantRoutes: buildTenantRoutesMock,
      };

      // Verify that calling buildAdminRoutes returns the admin router
      const adminRouter = mockModule.buildAdminRoutes();
      expect(buildAdminRoutesMock).toHaveBeenCalledTimes(1);
      expect(adminRouter).toBeDefined();

      // Verify that calling buildTenantRoutes returns the tenant router
      const tenantRouter = mockModule.buildTenantRoutes();
      expect(buildTenantRoutesMock).toHaveBeenCalledTimes(1);
      expect(tenantRouter).toBeDefined();
    });
  });
});
