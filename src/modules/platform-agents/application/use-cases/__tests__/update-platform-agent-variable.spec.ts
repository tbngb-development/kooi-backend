import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma } from "@prisma/client";
import { UpdatePlatformAgentVariableUseCase } from "../update-platform-agent-variable.use-case";
import type { PlatformAgentRepository } from "../../interfaces/platform-agent-repository.interface";
import {
  PlatformAgentNotFoundError,
  PlatformAgentVariableNotFoundError,
  PlatformAgentVariableMismatchError,
} from "../../../domain/errors/platform-agent.errors";
import type { PlatformAgentWithCount } from "../../interfaces/platform-agent-repository.interface";
import type { RequiredVariable } from "../../../../../shared/types/bolna.types";

describe("UpdatePlatformAgentVariableUseCase", () => {
  let repository: PlatformAgentRepository;
  let useCase: UpdatePlatformAgentVariableUseCase;

  const mockAgentId = "agent-uuid-123";

  const initialVariables: RequiredVariable[] = [
    {
      name: "lead_name",
      label: "Lead Name",
      required: true,
      isEditable: true,
      inputType: "text",
      defaultValue: null,
    },
    {
      name: "company_name",
      label: "Company",
      required: false,
      isEditable: true,
      inputType: "text",
      defaultValue: "Acme",
    },
    {
      name: "notes",
      label: "Notes",
      required: false,
      isEditable: false,
      inputType: "textarea",
      defaultValue: "Initial note",
    },
  ];

  const mockAgent: PlatformAgentWithCount = {
    id: mockAgentId,
    bolnaId: "bolna-123",
    slug: "real-estate-agent",
    name: "Real Estate Agent",
    category: "Real Estate",
    description: "Handles outbound leads",
    type: "OUTBOUND",
    defaultConfig: {},
    systemPrompt: "You are a helpful agent.",
    welcomeMessage: "Hello!",
    requiredVariables: initialVariables as unknown as Prisma.JsonValue,
    gender: "FEMALE",
    isActive: true,
    isFeatured: false,
    sortOrder: 1,
    industryPackId: null,
    bolnaApiKeyId: "key-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { assistants: 2, categories: 1 },
  };

  beforeEach(() => {
    repository = {
      findById: vi.fn().mockResolvedValue(mockAgent),
      updateAgentVariables: vi.fn().mockResolvedValue(mockAgent),
    } as unknown as PlatformAgentRepository;

    useCase = new UpdatePlatformAgentVariableUseCase(repository);
  });

  it("should update targeted variable and preserve all other variables and order", async () => {
    const result = await useCase.execute(mockAgentId, "company_name", {
      label: "Organization Name",
      required: true,
      defaultValue: "Global Corp",
      inputType: "text",
    });

    expect(result.variable).toEqual({
      name: "company_name",
      label: "Organization Name",
      required: true,
      isEditable: true,
      inputType: "text",
      defaultValue: "Global Corp",
    });

    expect(repository.updateAgentVariables).toHaveBeenCalledTimes(1);
    expect(repository.updateAgentVariables).toHaveBeenCalledWith(
      mockAgentId,
      {
        requiredVariables: [
          initialVariables[0], // lead_name untouched
          {
            name: "company_name",
            label: "Organization Name",
            required: true,
            isEditable: true,
            inputType: "text",
            defaultValue: "Global Corp",
          },
          initialVariables[2], // notes untouched
        ],
      },
    );
  });

  it("should allow partial updates without overwriting unprovided fields", async () => {
    const result = await useCase.execute(mockAgentId, "lead_name", {
      required: false,
    });

    expect(result.variable).toEqual({
      name: "lead_name",
      label: "Lead Name",
      required: false,
      isEditable: true,
      inputType: "text",
      defaultValue: null,
    });
  });

  it("should succeed when body name matches route param variableName", async () => {
    const result = await useCase.execute(mockAgentId, "lead_name", {
      name: "lead_name",
      label: "Full Name",
    });

    expect(result.variable.label).toBe("Full Name");
  });

  it("should throw PlatformAgentVariableMismatchError when body name does not match route param", async () => {
    await expect(
      useCase.execute(mockAgentId, "lead_name", {
        name: "different_name",
        label: "Full Name",
      }),
    ).rejects.toThrow(PlatformAgentVariableMismatchError);

    expect(repository.updateAgentVariables).not.toHaveBeenCalled();
  });

  it("should throw PlatformAgentNotFoundError when agent does not exist", async () => {
    vi.mocked(repository.findById).mockResolvedValueOnce(null);

    await expect(
      useCase.execute("non-existent-agent", "lead_name", { required: true }),
    ).rejects.toThrow(PlatformAgentNotFoundError);

    expect(repository.updateAgentVariables).not.toHaveBeenCalled();
  });

  it("should throw PlatformAgentVariableNotFoundError when variable does not exist in agent", async () => {
    await expect(
      useCase.execute(mockAgentId, "unknown_variable", { required: true }),
    ).rejects.toThrow(PlatformAgentVariableNotFoundError);

    expect(repository.updateAgentVariables).not.toHaveBeenCalled();
  });

  it("should throw PlatformAgentVariableNotFoundError when agent has null requiredVariables", async () => {
    vi.mocked(repository.findById).mockResolvedValueOnce({
      ...mockAgent,
      requiredVariables: null,
    });

    await expect(
      useCase.execute(mockAgentId, "lead_name", { required: true }),
    ).rejects.toThrow(PlatformAgentVariableNotFoundError);

    expect(repository.updateAgentVariables).not.toHaveBeenCalled();
  });
});
