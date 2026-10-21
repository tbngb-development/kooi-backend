import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterAssistantUseCase } from "../register-assistant.use-case";
import { UpdateAssistantUseCase } from "../update-assistant.use-case";
import { AssistantNotFoundError, AssistantVariableValidationError } from "../../../domain/errors/assistant.errors";
import type { AssistantRepository } from "../../interfaces/assistant-repository.interface";
import type { PlatformAgentRepository } from "../../../../platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaApiKeyRepository } from "../../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";

describe("Assistant Use Cases - Dynamic Variables", () => {
  let mockAssistantRepo: AssistantRepository;
  let mockPlatformAgentRepo: PlatformAgentRepository;
  let mockApiKeyRepo: BolnaApiKeyRepository;

  beforeEach(() => {
    mockAssistantRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      findByIdWithPlatformAgent: vi.fn(),
      findByPlatformAgentId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((tenantId, data) =>
        Promise.resolve({
          id: "asst-1",
          name: data.name,
          tenantId,
          platformAgentId: data.platformAgentId,
          config: data.config,
          variables: data.variables ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          isDeleted: false,
          deletedAt: null,
        }),
      ),
      update: vi.fn().mockImplementation((tenantId, id, data) =>
        Promise.resolve({
          id,
          name: data.name ?? "Updated Name",
          tenantId,
          platformAgentId: "pa-1",
          config: {},
          variables: data.variables ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          isDeleted: false,
          deletedAt: null,
        }),
      ),
      updateConfig: vi.fn(),
      findByTenantId: vi.fn(),
      repointPlatformAgent: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
    };

    mockPlatformAgentRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "pa-1",
        bolnaId: "bolna-agent-1",
        bolnaApiKeyId: "key-1",
        name: "Sara Real Estate",
        slug: "sara-re",
        type: "BOTH",
        isActive: true,
        isFeatured: false,
        defaultConfig: { voice: "default" },
        requiredVariables: [
          {
            name: "agentName",
            label: "Agent Name",
            required: true,
            isEditable: true,
            defaultValue: "Sara",
          },
          {
            name: "builderName",
            label: "Builder Name",
            required: true,
            isEditable: true,
            defaultValue: null,
          },
        ],
      }),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findByBolnaId: vi.fn(),
      findBySlug: vi.fn(),
      delete: vi.fn(),
    } as any;

    mockApiKeyRepo = {
      findKeyForTenant: vi.fn().mockResolvedValue({
        id: "key-1",
        isActive: true,
      }),
    } as any;
  });

  describe("RegisterAssistantUseCase", () => {
    it("should register assistant with valid variables for agent type BOTH", async () => {
      const useCase = new RegisterAssistantUseCase(
        mockAssistantRepo,
        mockPlatformAgentRepo,
        mockApiKeyRepo,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        platformAgentId: "pa-1",
        name: "My AI Assistant",
        variables: {
          inbound: {
            variables: { builderName: "Sobha Developers" },
            welcomeMessage: {
              type: "custom",
              defaultValue: "Default Welcome",
              customValue: "Hi, this is ${agentName} from ${builderName}. How may I help you?",
            },
          },
        },
      });

      expect(result.id).toBe("asst-1");
      expect(mockAssistantRepo.create).toHaveBeenCalledWith("tenant-1", {
        platformAgentId: "pa-1",
        name: "My AI Assistant",
        config: { voice: "default" },
        variables: {
          inbound: {
            variables: {
              agentName: "Sara",
              builderName: "Sobha Developers",
            },
            welcomeMessage: {
              type: "custom",
              defaultValue: "Default Welcome",
              customValue: "Hi, this is ${agentName} from ${builderName}. How may I help you?",
            },
          },
        },
      });
    });

    it("should throw validation error if agent type does not accept inbound/outbound variables", async () => {
      // Set platform agent to OUTBOUND
      mockPlatformAgentRepo.findById = vi.fn().mockResolvedValue({
        id: "pa-1",
        bolnaId: "bolna-agent-1",
        bolnaApiKeyId: "key-1",
        type: "OUTBOUND",
        isActive: true,
        defaultConfig: {},
        requiredVariables: [],
      });

      const useCase = new RegisterAssistantUseCase(
        mockAssistantRepo,
        mockPlatformAgentRepo,
        mockApiKeyRepo,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          platformAgentId: "pa-1",
          name: "Outbound Agent",
          variables: {
            inbound: { variables: {} },
          },
        }),
      ).rejects.toThrow(AssistantVariableValidationError);
    });
  });

  describe("UpdateAssistantUseCase", () => {
    it("should update variables when valid", async () => {
      mockAssistantRepo.findByIdWithPlatformAgent = vi.fn().mockResolvedValue({
        id: "asst-1",
        name: "My Assistant",
        tenantId: "tenant-1",
        platformAgentId: "pa-1",
        config: {},
        variables: null,
        platformAgent: {
          id: "pa-1",
          type: "OUTBOUND",
          requiredVariables: [
            {
              name: "builderName",
              label: "Builder Name",
              required: true,
              isEditable: true,
            },
          ],
        },
      });

      const useCase = new UpdateAssistantUseCase(mockAssistantRepo);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        id: "asst-1",
        name: "Updated Name",
        variables: {
          outbound: {
            variables: { builderName: "Prestige Group" },
            welcomeMessage: {
              type: "default",
              defaultValue: "Hi, calling from Prestige Group.",
            },
          },
        },
      });

      expect(result.name).toBe("Updated Name");
      expect(mockAssistantRepo.update).toHaveBeenCalledWith("tenant-1", "asst-1", {
        name: "Updated Name",
        variables: {
          outbound: {
            variables: { builderName: "Prestige Group" },
            welcomeMessage: {
              type: "default",
              defaultValue: "Hi, calling from Prestige Group.",
            },
          },
        },
      });
    });

    it("should throw AssistantNotFoundError if assistant does not exist", async () => {
      mockAssistantRepo.findByIdWithPlatformAgent = vi.fn().mockResolvedValue(null);

      const useCase = new UpdateAssistantUseCase(mockAssistantRepo);

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          id: "non-existent",
          name: "Test",
        }),
      ).rejects.toThrow(AssistantNotFoundError);
    });
  });
});
