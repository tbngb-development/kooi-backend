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
import { ValidationError } from "../../../shared/errors/validation.error";
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
    gender: null,
    type: "OUTBOUND",
    audioUrl: null,
    agentVariables: [
      {
        key: "company_name",
        defaultValue: "Acme Corp",
        required: false,
        isTenantVisible: true,
        isTenantEditable: true,
      },
      {
        key: "system_tier",
        defaultValue: "premium",
        required: false,
        isTenantVisible: true,
        isTenantEditable: false,
      },
      {
        key: "internal_secret",
        defaultValue: "secret_123",
        required: false,
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
    connectionConfigs: [
      {
        connection_id: "conn_123",
        agent_phone_number: "+1234567890",
      },
    ],
    retryConfig: {
      max_retries: 2,
      retry_on: {
        busy: { enabled: true, threshold_seconds: 30 },
      },
      retry_interval_minutes: [5, 10],
    },
    allowTenantVisible: true,
    allowedSchedule: null,
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
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
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
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
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
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
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
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          agentVariables: [
            {
              key: "dup_key",
              defaultValue: "val1",
              required: false,
              isTenantVisible: true,
              isTenantEditable: true,
            },
            {
              key: "dup_key",
              defaultValue: "val2",
              required: false,
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
        connectionConfigs: [
          {
            connection_id: "conn_123",
            agent_phone_number: "+1234567890",
          },
        ],
      });

      expect(result.id).toBe("agent-uuid-1");
      expect(result.name).toBe("Customer Support Agent");
      expect(result.apiKey?.tenant.name).toBe("Acme Corp");
      expect(result.status).toBe("ACTIVE");
      expect(result.connectionConfigs).toHaveLength(1);
      expect(result.connectionConfigs[0].connection_id).toBe("conn_123");
      expect(result.retryConfig.max_retries).toBe(2);
    });

    it("creates an agent with required input variables, enum output variables, and dynamic welcome template", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);

      const agentWithNewFields: SarvamAgentWithApiKeyAndTenant = {
        ...sampleAgentWithApiKey,
        agentVariables: [
          {
            key: "customer_name",
            defaultValue: "",
            required: true,
            isTenantVisible: true,
            isTenantEditable: true,
          },
        ],
        outputVariables: [
          {
            name: "call_disposition",
            description: "Final call outcome",
            type: "enum",
            options: ["interested", "callback", "not_interested"],
          },
        ],
        welcomeMessage: {
          defaultMessage: "Hello customer.",
          customTemplate: "Hello {{customer_name}}, welcome.",
          interpolationVariables: ["customer_name"],
        },
      };

      vi.mocked(mockAgentRepo.create).mockResolvedValue(agentWithNewFields);

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      const result = await useCase.execute({
        name: "Refactored Agent",
        apiKeyId: "key-uuid-1",
        appId: "sarvam_app_02",
        appVersion: 1,
        createdBy: "admin-1",
        connectionConfigs: [{ connection_id: "conn-1", agent_phone_number: "+12345" }],
        agentVariables: [
          {
            key: "customer_name",
            defaultValue: "",
            required: true,
            isTenantVisible: true,
            isTenantEditable: true,
          },
        ],
        outputVariables: [
          {
            name: "call_disposition",
            description: "Final call outcome",
            type: "enum",
            options: ["interested", "callback", "not_interested"],
          },
        ],
        welcomeMessage: {
          defaultMessage: "Hello customer.",
          customTemplate: "Hello {{customer_name}}, welcome.",
        },
      });

      expect(result.agentVariables[0].required).toBe(true);
      expect(result.outputVariables[0].type).toBe("enum");
      expect(result.outputVariables[0].options).toEqual(["interested", "callback", "not_interested"]);
      expect(result.welcomeMessage?.customTemplate).toBe("Hello {{customer_name}}, welcome.");
      expect(result.welcomeMessage?.interpolationVariables).toEqual(["customer_name"]);
    });

    it("rejects agent creation if enum output variable has duplicate options", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      await expect(
        useCase.execute({
          name: "Invalid Enum Agent",
          apiKeyId: "key-uuid-1",
          appId: "sarvam_app_dup_enum",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "conn-1", agent_phone_number: "+12345" }],
          outputVariables: [
            {
              name: "sentiment",
              description: "Customer sentiment",
              type: "enum",
              options: ["Positive", "positive"], // Duplicate case-insensitive
            },
          ],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects agent creation if welcome template references an undefined variable", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      await expect(
        useCase.execute({
          name: "Undefined Var Template Agent",
          apiKeyId: "key-uuid-1",
          appId: "sarvam_app_template_err",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "conn-1", agent_phone_number: "+12345" }],
          agentVariables: [
            {
              key: "user_name",
              defaultValue: "",
              required: false,
              isTenantVisible: true,
              isTenantEditable: true,
            },
          ],
          welcomeMessage: {
            defaultMessage: "Hello.",
            customTemplate: "Hello {{unknown_variable}}, your order is ready.",
          },
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects creation when connectionConfigs is empty or omitted", async () => {
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
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [],
        }),
      ).rejects.toThrow();
    });

    it("rejects creation when connectionConfigs entries are malformed", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      // Missing connection_id
      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [
            { connection_id: "", agent_phone_number: "+1234567890" },
          ],
        }),
      ).rejects.toThrow();

      // Missing agent_phone_number
      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [
            { connection_id: "conn_1", agent_phone_number: "   " },
          ],
        }),
      ).rejects.toThrow();

      // Unrecognized property
      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [
            {
              connection_id: "conn_1",
              agent_phone_number: "+1234567890",
              extra_property: "disallowed",
            } as any,
          ],
        }),
      ).rejects.toThrow();
    });

    it("accepts multiple valid connections on creation", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);
      vi.mocked(mockAgentRepo.create).mockResolvedValue({
        ...sampleAgentWithApiKey,
        connectionConfigs: [
          { connection_id: "c1", agent_phone_number: "+111" },
          { connection_id: "c2", agent_phone_number: "+222" },
        ],
      });

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      const result = await useCase.execute({
        name: "Multi Connection Agent",
        apiKeyId: "key-uuid-1",
        appId: "multi_app",
        appVersion: 1,
        createdBy: "admin-1",
        connectionConfigs: [
          { connection_id: "c1", agent_phone_number: "+111" },
          { connection_id: "c2", agent_phone_number: "+222" },
        ],
      });

      expect(result.connectionConfigs).toHaveLength(2);
      expect(result.connectionConfigs[1].connection_id).toBe("c2");
    });

    it("validates retryConfig max_retries boundary rules", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      // Negative max_retries
      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: { max_retries: -1 },
        }),
      ).rejects.toThrow();

      // Greater than 20
      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: { max_retries: 21 },
        }),
      ).rejects.toThrow();

      // Non-integer
      await expect(
        useCase.execute({
          name: "Test Agent",
          apiKeyId: "key-uuid-1",
          appId: "test_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: { max_retries: 2.5 as any },
        }),
      ).rejects.toThrow();
    });

    it("accepts dynamic retry_on condition keys and validates condition structure", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);
      vi.mocked(mockAgentRepo.create).mockImplementation(async (data) => ({
        ...sampleAgentWithApiKey,
        retryConfig: data.retryConfig as any,
      }));

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      // Custom dynamic keys accepted
      const result = await useCase.execute({
        name: "Dynamic Retry Agent",
        apiKeyId: "key-uuid-1",
        appId: "dynamic_retry_app",
        appVersion: 1,
        createdBy: "admin-1",
        connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
        retryConfig: {
          max_retries: 3,
          retry_on: {
            custom_telephony_error: { enabled: true, threshold_seconds: 45 },
            unreachable: { enabled: false },
          },
        },
      });

      expect(result.retryConfig.retry_on).toBeDefined();
      expect(result.retryConfig.retry_on?.custom_telephony_error).toEqual({
        enabled: true,
        threshold_seconds: 45,
      });
      expect(result.retryConfig.retry_on?.unreachable).toEqual({
        enabled: false,
      });

      // Malformed condition: missing enabled
      await expect(
        useCase.execute({
          name: "Invalid Retry Agent",
          apiKeyId: "key-uuid-1",
          appId: "invalid_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: {
            max_retries: 3,
            retry_on: {
              broken: { threshold_seconds: 10 } as any,
            },
          },
        }),
      ).rejects.toThrow();

      // Negative threshold_seconds
      await expect(
        useCase.execute({
          name: "Invalid Retry Agent",
          apiKeyId: "key-uuid-1",
          appId: "invalid_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: {
            max_retries: 3,
            retry_on: {
              broken: { enabled: true, threshold_seconds: -5 },
            },
          },
        }),
      ).rejects.toThrow();
    });

    it("preserves retry_interval_minutes data type as scalar integer or array of integers", async () => {
      vi.mocked(mockApiKeyRepo.findById).mockResolvedValue(sampleApiKey);
      vi.mocked(mockAgentRepo.existsForApiKeyAndAppId).mockResolvedValue(false);
      vi.mocked(mockAgentRepo.create).mockImplementation(async (data) => ({
        ...sampleAgentWithApiKey,
        retryConfig: data.retryConfig as any,
      }));

      const useCase = new CreateSarvamAgentUseCase(
        mockAgentRepo,
        mockApiKeyRepo,
        mapper,
      );

      // Scalar integer preserved
      const singleRes = await useCase.execute({
        name: "Single Interval Agent",
        apiKeyId: "key-uuid-1",
        appId: "single_interval_app",
        appVersion: 1,
        createdBy: "admin-1",
        connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
        retryConfig: {
          max_retries: 2,
          retry_interval_minutes: 15,
        },
      });
      expect(singleRes.retryConfig.retry_interval_minutes).toBe(15);
      expect(Array.isArray(singleRes.retryConfig.retry_interval_minutes)).toBe(false);

      // Array preserved
      const arrayRes = await useCase.execute({
        name: "Array Interval Agent",
        apiKeyId: "key-uuid-1",
        appId: "array_interval_app",
        appVersion: 1,
        createdBy: "admin-1",
        connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
        retryConfig: {
          max_retries: 3,
          retry_interval_minutes: [5, 10, 20],
        },
      });
      expect(arrayRes.retryConfig.retry_interval_minutes).toEqual([5, 10, 20]);
      expect(Array.isArray(arrayRes.retryConfig.retry_interval_minutes)).toBe(true);

      // Negative interval rejected
      await expect(
        useCase.execute({
          name: "Invalid Interval Agent",
          apiKeyId: "key-uuid-1",
          appId: "invalid_interval_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: {
            max_retries: 2,
            retry_interval_minutes: -10,
          },
        }),
      ).rejects.toThrow();

      // Negative interval in array rejected
      await expect(
        useCase.execute({
          name: "Invalid Interval Agent",
          apiKeyId: "key-uuid-1",
          appId: "invalid_interval_app",
          appVersion: 1,
          createdBy: "admin-1",
          connectionConfigs: [{ connection_id: "c1", agent_phone_number: "+1" }],
          retryConfig: {
            max_retries: 2,
            retry_interval_minutes: [5, -2, 10],
          },
        }),
      ).rejects.toThrow();
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

  describe("UpdateSarvamAgentUseCase", () => {
    it("updates existing connections successfully", async () => {
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(sampleAgentWithApiKey);
      vi.mocked(mockAgentRepo.update).mockImplementation(async (id, data) => ({
        ...sampleAgentWithApiKey,
        ...(data.connectionConfigs && {
          connectionConfigs: data.connectionConfigs as any,
        }),
      }));

      const useCase = new UpdateSarvamAgentUseCase(mockAgentRepo, mapper);
      const res = await useCase.execute({
        id: "agent-uuid-1",
        connectionConfigs: [
          { connection_id: "new_conn", agent_phone_number: "+999999" },
        ],
      });

      expect(res.connectionConfigs).toHaveLength(1);
      expect(res.connectionConfigs[0].connection_id).toBe("new_conn");
    });

    it("rejects saving an empty connection list on update", async () => {
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(sampleAgentWithApiKey);

      const useCase = new UpdateSarvamAgentUseCase(mockAgentRepo, mapper);
      await expect(
        useCase.execute({
          id: "agent-uuid-1",
          connectionConfigs: [],
        }),
      ).rejects.toThrow();
    });

    it("enforces strict connection requirement when updating existing incomplete record", async () => {
      const incompleteRecord = {
        ...sampleAgentWithApiKey,
        connectionConfigs: [],
      };
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(
        incompleteRecord as any,
      );

      const useCase = new UpdateSarvamAgentUseCase(mockAgentRepo, mapper);

      // Omitting connectionConfigs on incomplete record fails
      await expect(
        useCase.execute({
          id: "agent-uuid-1",
          name: "Updated Name",
        }),
      ).rejects.toThrow();

      // Supplying valid connection on incomplete record succeeds
      vi.mocked(mockAgentRepo.update).mockResolvedValue({
        ...incompleteRecord,
        name: "Updated Name",
        connectionConfigs: [
          { connection_id: "fixed_conn", agent_phone_number: "+111222" },
        ],
      });

      const updated = await useCase.execute({
        id: "agent-uuid-1",
        name: "Updated Name",
        connectionConfigs: [
          { connection_id: "fixed_conn", agent_phone_number: "+111222" },
        ],
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.connectionConfigs).toHaveLength(1);
      expect(updated.connectionConfigs[0].connection_id).toBe("fixed_conn");
    });

    it("preserves existing configuration when connectionConfigs and retryConfig are omitted on complete record", async () => {
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(sampleAgentWithApiKey);
      vi.mocked(mockAgentRepo.update).mockImplementation(async (id, data) => ({
        ...sampleAgentWithApiKey,
        ...(data.name && { name: data.name }),
      }));

      const useCase = new UpdateSarvamAgentUseCase(mockAgentRepo, mapper);
      const res = await useCase.execute({
        id: "agent-uuid-1",
        name: "Renamed Complete Agent",
      });

      expect(res.name).toBe("Renamed Complete Agent");
      expect(res.connectionConfigs).toHaveLength(1);
      expect(res.retryConfig.max_retries).toBe(2);
    });

    it("updates retryConfig and preserves data type", async () => {
      vi.mocked(mockAgentRepo.findById).mockResolvedValue(sampleAgentWithApiKey);
      vi.mocked(mockAgentRepo.update).mockImplementation(async (id, data) => ({
        ...sampleAgentWithApiKey,
        ...(data.retryConfig && { retryConfig: data.retryConfig as any }),
      }));

      const useCase = new UpdateSarvamAgentUseCase(mockAgentRepo, mapper);
      const res = await useCase.execute({
        id: "agent-uuid-1",
        retryConfig: {
          max_retries: 5,
          retry_interval_minutes: 10,
        },
      });

      expect(res.retryConfig.max_retries).toBe(5);
      expect(res.retryConfig.retry_interval_minutes).toBe(10);
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
    gender: null,
    type: "OUTBOUND",
    audioUrl: null,
      agentVariables: sampleAgentWithApiKey.agentVariables,
      welcomeMessage: sampleAgentWithApiKey.welcomeMessage,
      outputVariables: sampleAgentWithApiKey.outputVariables,
      connectionConfigs: sampleAgentWithApiKey.connectionConfigs,
      retryConfig: sampleAgentWithApiKey.retryConfig,
      allowTenantVisible: true,
    allowedSchedule: null,
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

