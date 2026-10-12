import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloneAgentToWorkspaceUseCase } from "../../../src/modules/platform-agents/application/use-cases/clone-agent-to-workspace.use-case";
import { ClonePlatformAgentUseCase } from "../../../src/modules/platform-agents/application/use-cases/clone-platform-agent.use-case";
import { RegisterPlatformAgentUseCase } from "../../../src/modules/platform-agents/application/use-cases/register-platform-agent.use-case";
import { SyncPlatformAgentUseCase } from "../../../src/modules/platform-agents/application/use-cases/sync-platform-agent.use-case";
import type { PlatformAgentRepository } from "../../../src/modules/platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../../../src/modules/platform-agents/application/interfaces/bolna-template-provider.interface";
import {
  PlatformAgentNotFoundError,
  DuplicatePlatformAgentSlugError,
  DuplicatePlatformAgentBolnaIdError,
} from "../../../src/modules/platform-agents/domain/errors/platform-agent.errors";
import type { PlatformAgent } from "@prisma/client";

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

function createMockTemplateProvider(): BolnaTemplateProvider {
  return {
    fetchTemplate: vi.fn(),
    createAgent: vi.fn(),
    listAgents: vi.fn(),
  };
}

const mockSourceAgent: PlatformAgent = {
  id: "pa-source-1",
  bolnaId: "bolna-src-123",
  name: "Solar Inbound Agent",
  slug: "solar-inbound",
  gender: "MALE",
  welcomeMessage: "Hello {customer_name}, interested in solar?",
  systemPrompt: "CAMPAIGN VARIABLES: {customer_name}, {monthly_bill}",
  requiredVariables: [
    {
      name: "customer_name",
      label: "Customer Name",
      required: true,
      isEditable: true,
      inputType: "text",
      defaultValue: null,
    },
  ],
  defaultConfig: {
    agent_name: "Solar Inbound Agent",
    agent_welcome_message: "Hello {customer_name}, interested in solar?",
  },
  isFeatured: false,
  isActive: true,
  category: "ENERGY",
  description: "Solar consultation template",
  industryPackId: null,
  bolnaApiKeyId: "key-source",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Platform Agents Use Cases (Module 6 - Master Templates & Cloning)", () => {
  let repository: ReturnType<typeof createMockPlatformAgentRepo>;
  let templateProvider: ReturnType<typeof createMockTemplateProvider>;

  beforeEach(() => {
    repository = createMockPlatformAgentRepo();
    templateProvider = createMockTemplateProvider();
    vi.clearAllMocks();
  });

  describe("CloneAgentToWorkspaceUseCase", () => {
    it("throws PlatformAgentNotFoundError when source blueprint does not exist", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const useCase = new CloneAgentToWorkspaceUseCase(repository, templateProvider);

      await expect(
        useCase.execute({
          sourcePlatformAgentId: "missing-id",
          targetApiKeyId: "target-key-1",
        }),
      ).rejects.toThrow(PlatformAgentNotFoundError);
    });

    it("creates cloned agent on Bolna provider and writes cloned record to database", async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockSourceAgent);
      vi.mocked(templateProvider.createAgent).mockResolvedValue({
        agent_id: "bolna-cloned-456",
        agent_name: "Solar Inbound Agent",
      } as any);

      const mockClonedAgent: PlatformAgent = {
        ...mockSourceAgent,
        id: "pa-cloned-2",
        bolnaId: "bolna-cloned-456",
        bolnaApiKeyId: "target-key-1",
        slug: "solar-inbound-copy-abc123",
        name: "Solar Inbound Agent (Tenant Org)",
      };
      vi.mocked(repository.cloneFrom).mockResolvedValue(mockClonedAgent);

      const useCase = new CloneAgentToWorkspaceUseCase(repository, templateProvider);

      const result = await useCase.execute({
        sourcePlatformAgentId: "pa-source-1",
        targetApiKeyId: "target-key-1",
        tenantName: "Tenant Org",
      });

      expect(result.bolnaAgentId).toBe("bolna-cloned-456");
      expect(result.clonedPlatformAgent).toEqual(mockClonedAgent);
      expect(templateProvider.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_config: expect.objectContaining({ agent_name: "Solar Inbound Agent" }),
        }),
        "target-key-1",
      );
      expect(repository.cloneFrom).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePlatformAgentId: "pa-source-1",
          bolnaId: "bolna-cloned-456",
          bolnaApiKeyId: "target-key-1",
          name: "Solar Inbound Agent (Tenant Org)",
        }),
      );
    });

    it("does not fail clone if extraction sync fails", async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockSourceAgent);
      vi.mocked(templateProvider.createAgent).mockResolvedValue({
        agent_id: "bolna-cloned-789",
      } as any);
      vi.mocked(repository.cloneFrom).mockResolvedValue({
        ...mockSourceAgent,
        id: "pa-cloned-3",
        bolnaId: "bolna-cloned-789",
      });

      const syncExtractionsUseCase = {
        execute: vi.fn().mockRejectedValue(new Error("Extraction sync error")),
      } as any;

      const useCase = new CloneAgentToWorkspaceUseCase(
        repository,
        templateProvider,
        syncExtractionsUseCase,
      );

      const result = await useCase.execute({
        sourcePlatformAgentId: "pa-source-1",
        targetApiKeyId: "target-key-1",
      });

      expect(result.bolnaAgentId).toBe("bolna-cloned-789");
      expect(syncExtractionsUseCase.execute).toHaveBeenCalledWith("pa-cloned-3");
    });
  });

  describe("ClonePlatformAgentUseCase", () => {
    it("delegates to CloneAgentToWorkspaceUseCase and returns cloned platform agent", async () => {
      const mockClonedAgent = { ...mockSourceAgent, id: "pa-cloned-4" };
      const cloneAgentUseCase = {
        execute: vi.fn().mockResolvedValue({
          clonedPlatformAgent: mockClonedAgent,
          bolnaAgentId: "b-cloned-4",
        }),
      } as any;

      const useCase = new ClonePlatformAgentUseCase(cloneAgentUseCase);
      const result = await useCase.execute({
        sourcePlatformAgentId: "pa-source-1",
        targetApiKeyId: "target-key-1",
        newName: "Custom Name",
      });

      expect(result).toEqual(mockClonedAgent);
      expect(cloneAgentUseCase.execute).toHaveBeenCalledWith({
        sourcePlatformAgentId: "pa-source-1",
        targetApiKeyId: "target-key-1",
        tenantName: "Custom Name",
      });
    });
  });

  describe("RegisterPlatformAgentUseCase", () => {
    it("throws DuplicatePlatformAgentSlugError if slug is already registered", async () => {
      vi.mocked(repository.findBySlug).mockResolvedValue(mockSourceAgent);
      const useCase = new RegisterPlatformAgentUseCase(repository, templateProvider);

      await expect(
        useCase.execute({
          name: "Solar Agent",
          slug: "solar-inbound",
          bolnaId: "b-new",
          bolnaApiKeyId: "k-1",
        }),
      ).rejects.toThrow(DuplicatePlatformAgentSlugError);
    });

    it("throws DuplicatePlatformAgentBolnaIdError if bolnaId is already registered", async () => {
      vi.mocked(repository.findBySlug).mockResolvedValue(null);
      vi.mocked(repository.findByBolnaId).mockResolvedValue(mockSourceAgent);
      const useCase = new RegisterPlatformAgentUseCase(repository, templateProvider);

      await expect(
        useCase.execute({
          name: "Solar Agent",
          slug: "solar-new",
          bolnaId: "bolna-src-123",
          bolnaApiKeyId: "k-1",
        }),
      ).rejects.toThrow(DuplicatePlatformAgentBolnaIdError);
    });

    it("fetches template, builds requiredVariables from prompts, and creates platform agent", async () => {
      vi.mocked(repository.findBySlug).mockResolvedValue(null);
      vi.mocked(repository.findByBolnaId).mockResolvedValue(null);
      vi.mocked(templateProvider.fetchTemplate).mockResolvedValue({
        defaultConfig: { agent_name: "Auto Agent" },
        systemPrompt: "CAMPAIGN VARIABLES: {user_name}, {loan_amount}",
        welcomeMessage: "Hello {user_name}",
      });

      vi.mocked(repository.create).mockResolvedValue({
        ...mockSourceAgent,
        id: "pa-registered-1",
      });

      const useCase = new RegisterPlatformAgentUseCase(repository, templateProvider);
      const result = await useCase.execute({
        name: "Auto Loan Agent",
        slug: "auto-loan-agent",
        bolnaId: "b-loan-1",
        bolnaApiKeyId: "key-1",
      });

      expect(result.id).toBe("pa-registered-1");
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Auto Loan Agent",
          slug: "auto-loan-agent",
          bolnaId: "b-loan-1",
          requiredVariables: [
            { name: "user_name", label: "User Name", required: true, isEditable: true },
            { name: "loan_amount", label: "Loan Amount", required: true, isEditable: true },
          ],
        }),
      );
    });
  });

  describe("SyncPlatformAgentUseCase", () => {
    it("throws PlatformAgentNotFoundError if agent to sync is missing", async () => {
      vi.mocked(repository.findById).mockResolvedValue(null);
      const useCase = new SyncPlatformAgentUseCase(repository, templateProvider);

      await expect(useCase.execute("non-existent")).rejects.toThrow(
        PlatformAgentNotFoundError,
      );
    });

    it("fetches remote Bolna template and updates local database defaultConfig and prompt", async () => {
      vi.mocked(repository.findById).mockResolvedValue(mockSourceAgent);
      vi.mocked(templateProvider.fetchTemplate).mockResolvedValue({
        defaultConfig: { agent_name: "Updated Remotely" },
        systemPrompt: "Updated prompt content",
        welcomeMessage: "Updated welcome",
      });

      vi.mocked(repository.update).mockResolvedValue({
        ...mockSourceAgent,
        systemPrompt: "Updated prompt content",
      });

      const useCase = new SyncPlatformAgentUseCase(repository, templateProvider);
      const result = await useCase.execute("pa-source-1");

      expect(templateProvider.fetchTemplate).toHaveBeenCalledWith(
        mockSourceAgent.bolnaId,
        mockSourceAgent.bolnaApiKeyId,
      );
      expect(repository.update).toHaveBeenCalledWith("pa-source-1", {
        defaultConfig: { agent_name: "Updated Remotely" },
        systemPrompt: "Updated prompt content",
      });
      expect(result.systemPrompt).toBe("Updated prompt content");
    });
  });
});
