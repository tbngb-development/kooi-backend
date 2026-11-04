import { describe, it, expect, beforeEach, vi } from "vitest";
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
import type {
  ISarvamAgentRepository,
  SarvamAgentWithApiKeyAndTenant,
} from "../application/interfaces/sarvam-agent-repository.interface";
import type { ISarvamAgentOverrideRepository } from "../application/interfaces/sarvam-agent-override-repository.interface";
import type {
  ISarvamApiKeyRepository,
  SarvamApiKeyWithTenant,
} from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";
import {
  SarvamAgentInvalidApiKeyError,
  SarvamAgentInactiveApiKeyError,
  SarvamAgentDuplicateAppIdError,
  SarvamAgentNotFoundError,
  SarvamAgentInvalidOverrideError,
} from "../domain/errors/sarvam-agent.errors";
import type { SarvamAgent, SarvamAgentTenantOverride } from "@prisma/client";

describe("Sarvam Agent Use Cases", () => {
  let mockAgentRepo: ISarvamAgentRepository;
  let mockOverrideRepo: ISarvamAgentOverrideRepository;
  let mockApiKeyRepo: ISarvamApiKeyRepository;
  let mapper: SarvamAgentMapper;

  const sampleApiKey: SarvamApiKeyWithTenant = {
    id: "key-uuid-1",
    tenantId: "tenant-uuid-1",
    apiKeyEncrypted: "encrypted_key",
    workspaceId: "wrk-sarvam-01",
    organizationId: "org-sarvam-01",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: "admin-1",
    updatedBy: null,
    tenant: {
      id: "tenant-uuid-1",
      name: "Acme Corp",
      email: "admin@acme.com",
      isActive: true,
    },
  };

  const sampleAgentWithApiKey: SarvamAgentWithApiKeyAndTenant = {
    id: "agent-uuid-1",
    name: "Customer Support Agent",
    apiKeyId: "key-uuid-1",
    appId: "sarvam_app_01",
    appVersion: 1,
    attemptsPerSecond: 5,
    webhookUrl: "https://api.acme.com/webhook",
    agentVariables: [
      {
        key: "company_name",
        defaultValue: "Acme Corp",
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "system_tier",
        defaultValue: "premium",
        isTenantVisible: true,
        isTenantEditable: false,
      },
      {
        key: "internal_secret",
        defaultValue: "secret_123",
        isTenantVisible: false,
        isTenantEditable: false,
      },
    ],
    welcomeMessage: {
      defaultMessage: "Hello! Welcome to Acme Corp customer care.",
    },
    outputVariables: [
      {
        name: "call_sentiment",
        description: "Customer overall call sentiment",
      },
    ],
    allowTenantVisible: true,
    status: "ACTIVE",
    createdBy: "admin-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    apiKey: sampleApiKey,
  };

  beforeEach(() => {
    mockAgentRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByApiKeyAndAppId: vi.fn(),
      list: vi.fn(),
      archive: vi.fn(),
      archiveByApiKeyId: vi.fn(),
      listAccessibleForTenant: vi.fn(),
      findAccessibleForTenant: vi.fn(),
      existsForApiKeyAndAppId: vi.fn(),
    };

    mockOverrideRepo = {
      findByAgentAndTenant: vi.fn(),
      upsertVariables: vi.fn(),
      upsertWelcomeMessage: vi.fn(),
      delete: vi.fn(),
    };

    mockApiKeyRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      existsForTenant: vi.fn(),
      tenantExists: vi.fn(),
    };

    mapper = new SarvamAgentMapper();
  });

  describe("CreateSarvamAgentUseCase", () => {
    it("throws SarvamAgentInvalidApiKeyError when API key does not exist", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(null);
      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "non-existent",
          appId: "app-1",
          appVersion: 1,
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(SarvamAgentInvalidApiKeyError);
    });

    it("throws SarvamAgentInactiveApiKeyError when API key is inactive", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue({
        ...sampleApiKey,
        isActive: false,
      });
      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "app-1",
          appVersion: 1,
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(SarvamAgentInactiveApiKeyError);
    });

    it("throws SarvamAgentDuplicateAppIdError when (apiKeyId, appId) already exists", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(true);
      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "sarvam_app_01",
          appVersion: 1,
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(SarvamAgentDuplicateAppIdError);
    });

    it("throws SarvamAgentInvalidOverrideError when duplicate variable keys are provided", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);
      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "app-1",
          appVersion: 1,
          createdBy: "admin-1",
          agentVariables: [
            {
              key: "dup_key",
              defaultValue: "val1",
              isTenantVisible: true,
              isTenantEditable: true,
            },
            {
              key: "dup_key",
              defaultValue: "val2",
              isTenantVisible: true,
              isTenantEditable: true,
            },
          ],
        }),
      ).rejects.toThrow(SarvamAgentInvalidOverrideError);
    });

    it("creates an agent and returns the admin DTO", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);
      vi.mocked(mockAgentRepo.create).mockResolvedValue(sampleAgentWithApiKey);

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      const result = await useCase.execute({
        name: "Customer Support Agent",
        apiKeyId: "key-uuid-1",
        appId: "sarvam_app_01",
        appVersion: 1,
        createdBy: "admin-1",
      });

      expect(result.id).toBe("agent-uuid-1");
      expect(result.name).toBe("Customer Support Agent");
      expect(result.apiKey?.tenant.name).toBe("Acme Corp");
      expect(result.status).toBe("ACTIVE");
    });
  });

  describe("ArchiveSarvamAgentUseCase", () => {
    it("archives an agent", async () => {
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(sampleAgentWithApiKey);
      vi.mocked(mockAgentRepo.archive).mockResolvedValue({
        ...sampleAgentWithApiKey,
        status: "ARCHIVED",
      });

      const useCase = new ArchiveSarvamAgentUseCase(mockAgentRepo, mapper);
      const result = await useCase.execute("agent-uuid-1", "admin-1");

      expect(result.status).toBe("ARCHIVED");
      expect(mockAgentRepo.archive).toHaveBeenCalledWith("agent-uuid-1");
    });

    it("throws SarvamAgentNotFoundError if agent does not exist", async () => {
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(null);
      const useCase = new ArchiveSarvamAgentUseCase(mockAgentRepo, mapper);

      await expect(useCase.execute("non-existent")).rejects.toThrow(
        SarvamAgentNotFoundError,
      );
    });
  });

  describe("Tenant Operations & Effective Value Resolution", () => {
    const rawAgent: SarvamAgent = {
      id: "agent-uuid-1",
      name: "Customer Support Agent",
      apiKeyId: "key-uuid-1",
      appId: "sarvam_app_01",
      appVersion: 1,
      attemptsPerSecond: 5,
      webhookUrl: null,
      agentVariables: sampleAgentWithApiKey.agentVariables,
      welcomeMessage: sampleAgentWithApiKey.welcomeMessage,
      outputVariables: sampleAgentWithApiKey.outputVariables,
      allowTenantVisible: true,
      status: "ACTIVE",
      createdBy: "admin-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    it("listTenantSarvamAgents returns only permitted active agents", async () => {
      vi.mocked(mockAgentRepo.listAccessibleForTenant).mockResolvedValue([
        rawAgent,
      ]);

      const useCase = new ListTenantSarvamAgentsUseCase(mockAgentRepo, mapper);
      const results = await useCase.execute("tenant-uuid-1");

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("agent-uuid-1");
      expect(results[0].name).toBe("Customer Support Agent");
    });

    it("getTenantSarvamAgent resolves defaults when no override exists and excludes non-visible variables", async () => {
      vi.mocked(mockAgentRepo.findAccessibleForTenant).mockResolvedValue(
        rawAgent,
      );
      vi.mocked(mockOverrideRepo.findByAgentAndTenant).mockResolvedValue(null);

      const useCase = new GetTenantSarvamAgentUseCase(
        mockAgentRepo,
        mockOverrideRepo,
        mapper,
      );

      const result = await useCase.execute("agent-uuid-1", "tenant-uuid-1");

      // Verify non-visible variable is excluded
      const varKeys = result.variables.map((v) => v.key);
      expect(varKeys).toContain("company_name");
      expect(varKeys).toContain("system_tier");
      expect(varKeys).not.toContain("internal_secret");

      // Verify effective values match defaults
      const companyVar = result.variables.find((v) => v.key === "company_name");
      expect(companyVar?.effectiveValue).toBe("Acme Corp");
      expect(companyVar?.isOverridden).toBe(false);

      // Verify welcome message is platform default
      expect(result.welcomeMessage.effectiveMessage).toBe(
        "Hello! Welcome to Acme Corp customer care.",
      );
      expect(result.welcomeMessage.isOverridden).toBe(false);
    });

    it("getTenantSarvamAgent applies tenant overrides for permitted editable variables", async () => {
      vi.mocked(mockAgentRepo.findAccessibleForTenant).mockResolvedValue(
        rawAgent,
      );

      const mockOverride: SarvamAgentTenantOverride = {
        id: "override-1",
        agentId: "agent-uuid-1",
        tenantId: "tenant-uuid-1",
        variableOverrides: {
          company_name: "Apex Solutions",
          system_tier: "hacked_value", // non-editable: should be ignored!
        },
        welcomeMessage: "Custom greeting from Apex Solutions!",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockOverrideRepo.findByAgentAndTenant).mockResolvedValue(
        mockOverride,
      );

      const useCase = new GetTenantSarvamAgentUseCase(
        mockAgentRepo,
        mockOverrideRepo,
        mapper,
      );

      const result = await useCase.execute("agent-uuid-1", "tenant-uuid-1");

      const companyVar = result.variables.find((v) => v.key === "company_name");
      expect(companyVar?.effectiveValue).toBe("Apex Solutions");
      expect(companyVar?.isOverridden).toBe(true);

      // system_tier is isTenantEditable=false, so override must NOT be applied
      const tierVar = result.variables.find((v) => v.key === "system_tier");
      expect(tierVar?.effectiveValue).toBe("premium");
      expect(tierVar?.isOverridden).toBe(false);

      // Welcome message override applied
      expect(result.welcomeMessage.effectiveMessage).toBe(
        "Custom greeting from Apex Solutions!",
      );
      expect(result.welcomeMessage.isOverridden).toBe(true);
    });

    it("updateTenantSarvamAgentVariables updates permitted variables and preserves empty string override", async () => {
      vi.mocked(mockAgentRepo.findAccessibleForTenant).mockResolvedValue(
        rawAgent,
      );
      vi.mocked(mockOverrideRepo.findByAgentAndTenant).mockResolvedValue(null);

      const savedOverride: SarvamAgentTenantOverride = {
        id: "override-1",
        agentId: "agent-uuid-1",
        tenantId: "tenant-uuid-1",
        variableOverrides: {
          company_name: "", // explicit empty string override
        },
        welcomeMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockOverrideRepo.upsertVariables).mockResolvedValue(
        savedOverride,
      );

      const useCase = new UpdateTenantSarvamAgentVariablesUseCase(
        mockAgentRepo,
        mockOverrideRepo,
        mapper,
      );

      const result = await useCase.execute("agent-uuid-1", "tenant-uuid-1", {
        variables: {
          company_name: "",
        },
      });

      expect(mockOverrideRepo.upsertVariables).toHaveBeenCalledWith(
        "agent-uuid-1",
        "tenant-uuid-1",
        { company_name: "" },
      );

      const companyVar = result.variables.find((v) => v.key === "company_name");
      expect(companyVar?.effectiveValue).toBe("");
      expect(companyVar?.isOverridden).toBe(true);
    });

    it("updateTenantSarvamAgentVariables clears override when passed null", async () => {
      vi.mocked(mockAgentRepo.findAccessibleForTenant).mockResolvedValue(
        rawAgent,
      );

      const existingOverride: SarvamAgentTenantOverride = {
        id: "override-1",
        agentId: "agent-uuid-1",
        tenantId: "tenant-uuid-1",
        variableOverrides: {
          company_name: "Custom Name",
        },
        welcomeMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockOverrideRepo.findByAgentAndTenant).mockResolvedValue(
        existingOverride,
      );

      const savedOverride: SarvamAgentTenantOverride = {
        ...existingOverride,
        variableOverrides: {},
      };
      vi.mocked(mockOverrideRepo.upsertVariables).mockResolvedValue(
        savedOverride,
      );

      const useCase = new UpdateTenantSarvamAgentVariablesUseCase(
        mockAgentRepo,
        mockOverrideRepo,
        mapper,
      );

      await useCase.execute("agent-uuid-1", "tenant-uuid-1", {
        variables: {
          company_name: null,
        },
      });

      expect(mockOverrideRepo.upsertVariables).toHaveBeenCalledWith(
        "agent-uuid-1",
        "tenant-uuid-1",
        {},
      );
    });

    it("updateTenantSarvamAgentVariables rejects attempts to modify non-editable variables", async () => {
      vi.mocked(mockAgentRepo.findAccessibleForTenant).mockResolvedValue(
        rawAgent,
      );

      const useCase = new UpdateTenantSarvamAgentVariablesUseCase(
        mockAgentRepo,
        mockOverrideRepo,
        mapper,
      );

      await expect(
        useCase.execute("agent-uuid-1", "tenant-uuid-1", {
          variables: {
            system_tier: "free_tier",
          },
        }),
      ).rejects.toThrow(SarvamAgentInvalidOverrideError);
    });

    it("updateTenantSarvamAgentWelcomeMessage clears custom message when null is passed", async () => {
      vi.mocked(mockAgentRepo.findAccessibleForTenant).mockResolvedValue(
        rawAgent,
      );

      const savedOverride: SarvamAgentTenantOverride = {
        id: "override-1",
        agentId: "agent-uuid-1",
        tenantId: "tenant-uuid-1",
        variableOverrides: {},
        welcomeMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(mockOverrideRepo.upsertWelcomeMessage).mockResolvedValue(
        savedOverride,
      );

      const useCase = new UpdateTenantSarvamAgentWelcomeMessageUseCase(
        mockAgentRepo,
        mockOverrideRepo,
        mapper,
      );

      const result = await useCase.execute("agent-uuid-1", "tenant-uuid-1", {
        customMessage: null,
      });

      expect(result.welcomeMessage.customMessage).toBeNull();
      expect(result.welcomeMessage.effectiveMessage).toBe(
        "Hello! Welcome to Acme Corp customer care.",
      );
      expect(result.welcomeMessage.isOverridden).toBe(false);
    });
  });
});

