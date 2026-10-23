import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboundCallerMatchUseCase } from "../inbound-caller-match.use-case";
import type { AssistantRepository } from "../../../../assistants/application/interfaces/assistant-repository.interface";
import type { LeadRepository } from "../../../../leads/application/interfaces/lead-repository.interface";
import type { CallRepository } from "../../interfaces/call-repository.interface";
import type { ICallWalletGuard } from "../../../../wallet/application/guards/call-wallet.guard";

describe("InboundCallerMatchUseCase", () => {
  let assistantRepo: Partial<AssistantRepository>;
  let leadRepo: Partial<LeadRepository>;
  let callRepo: Partial<CallRepository>;
  let callWalletGuard: ICallWalletGuard;
  let useCase: InboundCallerMatchUseCase;

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  const sampleAssistant = {
    id: "asst-1",
    name: "Support Assistant",
    tenantId: "tenant-123",
    variables: {
      inbound: {
        welcomeMessage: {
          type: "custom",
          customValue: "Welcome to Kooi Support",
        },
        variables: { agent_name: "Sara" },
      },
    },
    platformAgent: {
      welcomeMessage: "Default welcome",
    },
  };

  beforeEach(() => {
    assistantRepo = {
      findInboundByBolnaAgentId: vi.fn().mockResolvedValue(sampleAssistant as any),
    };

    leadRepo = {
      findByTenantAndPhone: vi.fn().mockResolvedValue(null),
      createInboundLead: vi.fn().mockResolvedValue({ id: "lead-1", name: null }),
      updateStatus: vi.fn().mockResolvedValue({ id: "lead-1" } as any),
    };

    callRepo = {
      createInboundCallRecord: vi.fn().mockResolvedValue({ id: "call-1" } as any),
    };

    callWalletGuard = {
      hasSufficientBalance: vi.fn().mockResolvedValue(true),
      assertSufficientBalance: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new InboundCallerMatchUseCase(
      assistantRepo as AssistantRepository,
      leadRepo as LeadRepository,
      callRepo as CallRepository,
      callWalletGuard,
      mockLogger as any,
    );
  });

  it("returns {} when contact number is invalid", async () => {
    const res = await useCase.execute({
      contactNumber: "invalid",
      agentId: "agent-1",
      executionId: "exec-1",
    });

    expect(res).toEqual({});
    expect(assistantRepo.findInboundByBolnaAgentId).not.toHaveBeenCalled();
  });

  it("returns {} when no inbound assistant matches agentId", async () => {
    (assistantRepo.findInboundByBolnaAgentId as any).mockResolvedValue(null);

    const res = await useCase.execute({
      contactNumber: "+919876543210",
      agentId: "agent-non-existent",
      executionId: "exec-1",
    });

    expect(res).toEqual({});
    expect(callWalletGuard.hasSufficientBalance).not.toHaveBeenCalled();
    expect(leadRepo.createInboundLead).not.toHaveBeenCalled();
  });

  it("returns {} when tenant wallet has insufficient balance", async () => {
    (callWalletGuard.hasSufficientBalance as any).mockResolvedValue(false);

    const res = await useCase.execute({
      contactNumber: "+919876543210",
      agentId: "agent-1",
      executionId: "exec-1",
    });

    expect(res).toEqual({});
    expect(callWalletGuard.hasSufficientBalance).toHaveBeenCalledWith("tenant-123");
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Inbound call rejected: insufficient tenant wallet balance",
      expect.objectContaining({
        action: "inbound.caller_match.insufficient_balance",
        tenantId: "tenant-123",
      }),
    );
    // Ensure no lead or call records are created
    expect(leadRepo.findByTenantAndPhone).not.toHaveBeenCalled();
    expect(leadRepo.createInboundLead).not.toHaveBeenCalled();
    expect(callRepo.createInboundCallRecord).not.toHaveBeenCalled();
  });

  it("creates lead, call record, and returns output when wallet balance is sufficient", async () => {
    (callWalletGuard.hasSufficientBalance as any).mockResolvedValue(true);

    const res = await useCase.execute({
      contactNumber: "+919876543210",
      agentId: "agent-1",
      executionId: "exec-1",
    });

    expect(callWalletGuard.hasSufficientBalance).toHaveBeenCalledWith("tenant-123");
    expect(leadRepo.createInboundLead).toHaveBeenCalledWith({
      phone: "+919876543210",
      tenantId: "tenant-123",
      assistantId: "asst-1",
    });
    expect(callRepo.createInboundCallRecord).toHaveBeenCalledWith({
      bolnaCallId: "exec-1",
      tenantId: "tenant-123",
      assistantId: "asst-1",
      leadId: "lead-1",
    });
    expect(res).toEqual(
      expect.objectContaining({
        is_known_lead: false,
        contact_number: "+919876543210",
        welcome_message: "Welcome to Kooi Support",
        agent_name: "Sara",
      }),
    );
  });
});
