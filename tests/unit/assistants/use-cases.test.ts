import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterAssistantUseCase } from "../../../src/modules/assistants/application/use-cases/register-assistant.use-case";
import { GetAssistantUseCase } from "../../../src/modules/assistants/application/use-cases/get-assistant.use-case";
import { UpdateAssistantUseCase } from "../../../src/modules/assistants/application/use-cases/update-assistant.use-case";
import { DeleteAssistantUseCase } from "../../../src/modules/assistants/application/use-cases/delete-assistant.use-case";
import { RestoreAssistantUseCase } from "../../../src/modules/assistants/application/use-cases/restore-assistant.use-case";
import type {
  AssistantRepository,
  AssistantWithPlatformAgent,
} from "../../../src/modules/assistants/application/interfaces/assistant-repository.interface";
import type { PlatformAgentRepository } from "../../../src/modules/platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaApiKeyRepository } from "../../../src/modules/bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import { PlatformAgentNotFoundError } from "../../../src/modules/platform-agents/domain/errors/platform-agent.errors";
import {
  AssistantNotFoundError,
  AssistantNotDeletedError,
  PlatformAgentNotActiveError,
  PlatformAgentDedicatedError,
  ApiKeyMismatchError,
  PlatformAgentAlreadyAssignedError,
} from "../../../src/modules/assistants/domain/errors/assistant.errors";
import type { AssistantEntityData } from "../../../src/modules/assistants/domain/entities/assistant.entity";
import type { PlatformAgent, BolnaApiKey } from "@prisma/client";

function createMockAssistantRepo(): AssistantRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findByIdWithPlatformAgent: vi.fn(),
    findByPlatformAgentId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateConfig: vi.fn(),
    findByTenantId: vi.fn(),
    repointPlatformAgent: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };
}

function createMockPlatformAgentRepo(): PlatformAgentRepository {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByBolnaId: vi.fn(),
    list: vi.fn(),
    listActive: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateConfig: vi.fn(),
    updateVariables: vi.fn(),
    cloneFrom: vi.fn(),
    delete: vi.fn(),
    getAgentExtractionConfig: vi.fn(),
    getDispositionsForAgent: vi.fn(),
    assignCategory: vi.fn(),
    removeCategory: vi.fn(),
    assignDisposition: vi.fn(),
    removeDisposition: vi.fn(),
    countAssistants: vi.fn(),
    listAssignments: vi.fn(),
  };
}

function createMockBolnaApiKeyRepo(): BolnaApiKeyRepository {
  return {
    findKeyForTenant: vi.fn(),
    updateLastAccessed: vi.fn(),
    assignLeastLoadedKeyToTenant: vi.fn(),
    assignKeyToTenant: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    deactivate: vi.fn(),
    updateProfile: vi.fn(),
    updateKey: vi.fn(),
    activate: vi.fn(),
    listTenantsForKey: vi.fn(),
    reassignTenantsFromKey: vi.fn(),
    findTenantIdsUsingKey: vi.fn(),
  };
}

const mockApiKey: BolnaApiKey = {
  id: "key-1",
  keyIdentifier: "platform-default-key",
  encryptedKey: "enc-key",
  type: "GENERAL",
  isPlatformDefault: true,
  isActive: true,
  createdBy: "system",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastAccessedAt: null,
  bolnaConcurrencyCurrent: 0,
  bolnaConcurrencyMax: 10,
  bolnaProfileEmail: "admin@bolna.ai",
  bolnaProfileFetchedAt: null,
  bolnaProfileName: "Production Bolna",
  bolnaWalletBalance: 50000,
};

const mockPlatformAgent: PlatformAgent = {
  id: "pa-1",
  bolnaId: "bolna-agent-1",
  name: "Master Qualification Agent",
  slug: "master-qualification-agent",
  gender: "FEMALE",
  welcomeMessage: "Hello {customer_name}, thanks for taking our call.",
  systemPrompt: "1. CAMPAIGN VARIABLES: {customer_name}, {property_interest}",
  requiredVariables: [
    {
      name: "customer_name",
      label: "Customer Name",
      required: true,
      isEditable: true,
      inputType: "text",
      defaultValue: null,
    },
    {
      name: "property_interest",
      label: "Property Interest",
      required: false,
      isEditable: true,
      inputType: "text",
      defaultValue: "Villas",
    },
  ],
  defaultConfig: {
    agent_name: "Master Qualification Agent",
    agent_welcome_message: "Hello {customer_name}",
  },
  isFeatured: false,
  isActive: true,
  category: "REAL_ESTATE",
  description: "Real estate master blueprint",
  industryPackId: null,
  bolnaApiKeyId: "key-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAssistant: AssistantEntityData = {
  id: "asst-1",
  name: "My Sales Assistant",
  tenantId: "tenant-1",
  platformAgentId: "pa-1",
  config: { agent_name: "Master Qualification Agent" },
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  deletedAt: null,
};

describe("Assistants Use Cases (Module 6 - AI Voice Personas)", () => {
  let assistantRepo: ReturnType<typeof createMockAssistantRepo>;
  let platformAgentRepo: ReturnType<typeof createMockPlatformAgentRepo>;
  let apiKeyRepo: ReturnType<typeof createMockBolnaApiKeyRepo>;

  beforeEach(() => {
    assistantRepo = createMockAssistantRepo();
    platformAgentRepo = createMockPlatformAgentRepo();
    apiKeyRepo = createMockBolnaApiKeyRepo();
    vi.clearAllMocks();
  });

  describe("RegisterAssistantUseCase", () => {
    it("throws PlatformAgentNotFoundError when platform agent blueprint does not exist", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue(null);
      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "non-existent-pa",
          name: "New Assistant",
        }),
      ).rejects.toThrow(PlatformAgentNotFoundError);
    });

    it("throws PlatformAgentNotActiveError when blueprint is deactivated", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue({
        ...mockPlatformAgent,
        isActive: false,
      });
      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "pa-1",
          name: "New Assistant",
        }),
      ).rejects.toThrow(PlatformAgentNotActiveError);
    });

    it("throws ApiKeyMismatchError when tenant has no active Bolna API key", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue(mockPlatformAgent);
      vi.mocked(apiKeyRepo.findKeyForTenant).mockResolvedValue(null);
      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "pa-1",
          name: "New Assistant",
        }),
      ).rejects.toThrow(ApiKeyMismatchError);
    });

    it("throws ApiKeyMismatchError when tenant's key does not match platform agent key", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue(mockPlatformAgent); // key-1
      vi.mocked(apiKeyRepo.findKeyForTenant).mockResolvedValue({
        ...mockApiKey,
        id: "different-key-2",
      });
      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "pa-1",
          name: "New Assistant",
        }),
      ).rejects.toThrow(ApiKeyMismatchError);
    });

    it("throws PlatformAgentDedicatedError when isFeatured blueprint is occupied by another tenant", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue({
        ...mockPlatformAgent,
        isFeatured: true,
      });
      vi.mocked(apiKeyRepo.findKeyForTenant).mockResolvedValue(mockApiKey);
      vi.mocked(assistantRepo.findByPlatformAgentId).mockResolvedValue({
        ...mockAssistant,
        tenantId: "other-tenant-99",
      });

      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "pa-1",
          name: "New Assistant",
        }),
      ).rejects.toThrow(PlatformAgentDedicatedError);
    });

    it("throws PlatformAgentAlreadyAssignedError when blueprint already assigned to same tenant", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue(mockPlatformAgent);
      vi.mocked(apiKeyRepo.findKeyForTenant).mockResolvedValue(mockApiKey);
      // Not featured, but already exists in this tenant
      vi.mocked(assistantRepo.findByPlatformAgentId).mockResolvedValue(mockAssistant);

      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "pa-1",
          name: "New Assistant",
        }),
      ).rejects.toThrow(PlatformAgentAlreadyAssignedError);
    });

    it("successfully creates assistant with platform agent defaultConfig", async () => {
      vi.mocked(platformAgentRepo.findById).mockResolvedValue(mockPlatformAgent);
      vi.mocked(apiKeyRepo.findKeyForTenant).mockResolvedValue(mockApiKey);
      vi.mocked(assistantRepo.findByPlatformAgentId).mockResolvedValue(null);
      vi.mocked(assistantRepo.create).mockResolvedValue(mockAssistant);

      const useCase = new RegisterAssistantUseCase(assistantRepo, platformAgentRepo, apiKeyRepo);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        platformAgentId: "pa-1",
        name: "My Sales Assistant",
      });

      expect(result).toEqual(mockAssistant);
      expect(assistantRepo.create).toHaveBeenCalledWith("tenant-1", {
        platformAgentId: "pa-1",
        name: "My Sales Assistant",
        config: mockPlatformAgent.defaultConfig,
      });
    });
  });

  describe("GetAssistantUseCase", () => {
    it("throws AssistantNotFoundError when assistant is missing", async () => {
      vi.mocked(assistantRepo.findByIdWithPlatformAgent).mockResolvedValue(null);
      const useCase = new GetAssistantUseCase(assistantRepo);

      await expect(useCase.execute("tenant-1", "asst-not-found")).rejects.toThrow(
        AssistantNotFoundError,
      );
    });

    it("resolves structured requiredVariables from platform agent", async () => {
      const mockWithPa: AssistantWithPlatformAgent = {
        ...mockAssistant,
        platformAgent: {
          id: "pa-1",
          bolnaId: "b-1",
          name: "Master Agent",
          slug: "master-agent",
          systemPrompt: "prompt",
          welcomeMessage: "welcome",
          requiredVariables: [
            {
              name: "lead_name",
              label: "Lead Name",
              required: true,
              isEditable: false,
              inputType: "text",
              defaultValue: null,
            },
          ],
          description: null,
          category: null,
          isFeatured: false,
          industryPack: null,
        },
      };

      vi.mocked(assistantRepo.findByIdWithPlatformAgent).mockResolvedValue(mockWithPa);
      const useCase = new GetAssistantUseCase(assistantRepo);

      const result = await useCase.execute("tenant-1", "asst-1");

      expect(result.assistant).toEqual(mockWithPa);
      expect(result.variables).toEqual([
        {
          key: "lead_name",
          label: "Lead Name",
          required: true,
          isEditable: false,
          inputType: "text",
          defaultValue: null,
        },
      ]);
    });

    it("falls back to prompt placeholder extraction when requiredVariables is null", async () => {
      const mockWithPa: AssistantWithPlatformAgent = {
        ...mockAssistant,
        platformAgent: {
          id: "pa-1",
          bolnaId: "b-1",
          name: "Master Agent",
          slug: "master-agent",
          systemPrompt: "CAMPAIGN VARIABLES: {campaign_tag}",
          welcomeMessage: "Hello {customer_name}",
          requiredVariables: null, // Legacy / null
          description: null,
          category: null,
          isFeatured: false,
          industryPack: null,
        },
      };

      vi.mocked(assistantRepo.findByIdWithPlatformAgent).mockResolvedValue(mockWithPa);
      const useCase = new GetAssistantUseCase(assistantRepo);

      const result = await useCase.execute("tenant-1", "asst-1");

      expect(result.variables).toEqual([
        {
          key: "campaign_tag",
          label: "Campaign Tag",
          required: true,
          isEditable: true,
          inputType: "text",
          defaultValue: null,
        },
        {
          key: "customer_name",
          label: "Customer Name",
          required: true,
          isEditable: true,
          inputType: "text",
          defaultValue: null,
        },
      ]);
    });
  });

  describe("UpdateAssistantUseCase", () => {
    it("throws AssistantNotFoundError when assistant does not exist", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue(null);
      const useCase = new UpdateAssistantUseCase(assistantRepo);

      await expect(
        useCase.execute({ tenantId: "tenant-1", id: "asst-1", name: "Renamed" }),
      ).rejects.toThrow(AssistantNotFoundError);
    });

    it("updates assistant name through repository", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue(mockAssistant);
      vi.mocked(assistantRepo.update).mockResolvedValue({
        ...mockAssistant,
        name: "Renamed Assistant",
      });

      const useCase = new UpdateAssistantUseCase(assistantRepo);
      const result = await useCase.execute({
        tenantId: "tenant-1",
        id: "asst-1",
        name: "Renamed Assistant",
      });

      expect(result.name).toBe("Renamed Assistant");
      expect(assistantRepo.update).toHaveBeenCalledWith("tenant-1", "asst-1", "Renamed Assistant");
    });
  });

  describe("DeleteAssistantUseCase & RestoreAssistantUseCase", () => {
    it("throws AssistantNotFoundError if assistant to delete does not exist", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue(null);
      const useCase = new DeleteAssistantUseCase(assistantRepo);

      await expect(useCase.execute("tenant-1", "asst-1")).rejects.toThrow(
        AssistantNotFoundError,
      );
    });

    it("soft-deletes assistant when found", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue(mockAssistant);
      const useCase = new DeleteAssistantUseCase(assistantRepo);

      await useCase.execute("tenant-1", "asst-1");

      expect(assistantRepo.softDelete).toHaveBeenCalledWith("tenant-1", "asst-1");
    });

    it("throws AssistantNotFoundError if assistant to restore does not exist", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue(null);
      const useCase = new RestoreAssistantUseCase(assistantRepo);

      await expect(useCase.execute("tenant-1", "asst-1")).rejects.toThrow(
        AssistantNotFoundError,
      );
    });

    it("throws AssistantNotDeletedError when restoring an assistant that is active", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue({
        ...mockAssistant,
        isDeleted: false,
      });
      const useCase = new RestoreAssistantUseCase(assistantRepo);

      await expect(useCase.execute("tenant-1", "asst-1")).rejects.toThrow(
        AssistantNotDeletedError,
      );
    });

    it("restores soft-deleted assistant when isDeleted is true", async () => {
      vi.mocked(assistantRepo.findById).mockResolvedValue({
        ...mockAssistant,
        isDeleted: true,
        deletedAt: new Date(),
      });
      const useCase = new RestoreAssistantUseCase(assistantRepo);

      await useCase.execute("tenant-1", "asst-1");

      expect(assistantRepo.restore).toHaveBeenCalledWith("tenant-1", "asst-1");
    });
  });
});
