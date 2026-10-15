import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboundCallerMatchUseCase } from "../../../src/modules/calls/application/use-cases/inbound-caller-match.use-case";
import type { CallRepository } from "../../../src/modules/calls/application/interfaces/call-repository.interface";
import prisma from "../../../src/shared/config/database/prisma";

vi.mock("../../../src/shared/config/database/prisma", () => ({
  default: {
    phoneNumber: {
      findUnique: vi.fn(),
    },
    assistant: {
      findFirst: vi.fn(),
    },
    lead: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    call: {
      upsert: vi.fn(),
    },
  },
}));

describe("InboundCallerMatchUseCase - Strict Tenant Isolation", () => {
  let mockCallRepo: CallRepository;
  let useCase: InboundCallerMatchUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallRepo = {
      findInboundLeadContext: vi.fn().mockResolvedValue(null),
    } as unknown as CallRepository;

    useCase = new InboundCallerMatchUseCase(mockCallRepo);
  });

  it("should reject call if dialed number (agentNumber) is not found in PhoneNumber table", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValueOnce(null);

    const result = await useCase.execute({
      contactNumber: "+919999999999",
      agentId: "agent-bolna-123",
      executionId: "exec-1",
      agentNumber: "+918888888888",
    });

    expect(result).toEqual({});
    expect(prisma.phoneNumber.findUnique).toHaveBeenCalledWith({
      where: { phoneNumber: "+918888888888" },
      include: expect.any(Object),
    });
    expect(prisma.call.upsert).not.toHaveBeenCalled();
  });

  it("should reject call if dialed number is unassigned (tenantId is null)", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValueOnce({
      id: "phone-1",
      phoneNumber: "+918888888888",
      tenantId: null,
      status: "ACTIVE",
    } as any);

    const result = await useCase.execute({
      contactNumber: "+919999999999",
      agentId: "agent-bolna-123",
      executionId: "exec-1",
      agentNumber: "+918888888888",
    });

    expect(result).toEqual({});
    expect(prisma.call.upsert).not.toHaveBeenCalled();
  });

  it("should successfully isolate and route call when dialed number is assigned to Tenant A", async () => {
    const mockTenantAId = "tenant-a-uuid";
    const mockAssistantA = {
      id: "asst-a-uuid",
      name: "Tenant A Receptionist",
      tenantId: mockTenantAId,
      config: { welcomeMessage: "Welcome to Tenant A" },
      isDeleted: false,
      platformAgent: {
        id: "pa-1",
        type: "INBOUND",
      },
    };

    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValueOnce({
      id: "phone-1",
      phoneNumber: "+918888888888",
      tenantId: mockTenantAId,
      status: "ACTIVE",
      assistantId: mockAssistantA.id,
      assistant: mockAssistantA,
    } as any);

    vi.mocked(prisma.lead.findFirst).mockResolvedValueOnce({
      id: "lead-1",
      name: "John Doe",
      phone: "+919999999999",
      tenantId: mockTenantAId,
    } as any);

    vi.mocked(prisma.lead.update).mockResolvedValueOnce({} as any);
    vi.mocked(prisma.call.upsert).mockResolvedValueOnce({} as any);

    const result = await useCase.execute({
      contactNumber: "+919999999999",
      agentId: "agent-bolna-123",
      executionId: "exec-1",
      agentNumber: "+918888888888",
    });

    expect(result).toHaveProperty("is_known_lead", true);
    expect(result).toHaveProperty("welcome_message", "Welcome to Tenant A");
    expect(prisma.call.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: mockTenantAId,
          assistantId: mockAssistantA.id,
          agentNumber: "+918888888888",
        }),
      }),
    );
  });
});
