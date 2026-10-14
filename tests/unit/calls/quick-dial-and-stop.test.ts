import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "../../../src/shared/config/database/prisma";
import { QuickDialCallUseCase } from "../../../src/modules/calls/application/use-cases/quick-dial-call.use-case";
import { StopCallUseCase } from "../../../src/modules/calls/application/use-cases/stop-call.use-case";
import { InboundCallerMatchUseCase } from "../../../src/modules/calls/application/use-cases/inbound-caller-match.use-case";
import {
  CallNotFoundError,
  CallCannotBeStoppedError,
} from "../../../src/modules/calls/domain/errors/call.errors";
import { AssistantNotFoundError } from "../../../src/modules/assistants/domain/errors/assistant.errors";
import { InsufficientBalanceError } from "../../../src/modules/wallet/domain/errors/wallet.errors";

// Mock prisma
vi.mock("../../../src/shared/config/database/prisma", () => ({
  default: {
    assistant: {
      findFirst: vi.fn(),
    },
    lead: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    call: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("Quick Dial, Stop Call & Inbound Auto-Register", () => {
  const mockWalletRepo = {
    findByTenantId: vi.fn(),
    credit: vi.fn(),
    debit: vi.fn(),
    adjust: vi.fn(),
    createLedgerEntry: vi.fn(),
    listTransactions: vi.fn(),
    countTransactions: vi.fn(),
  };

  const mockBolnaClient = {
    calls: {
      create: vi.fn(),
      stop: vi.fn(),
    },
  };

  const mockBolnaFactory = {
    getClient: vi.fn().mockResolvedValue(mockBolnaClient),
    forTenant: vi.fn().mockResolvedValue(mockBolnaClient),
  };

  const mockCallRepo = {
    findInboundLeadContext: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("QuickDialCallUseCase", () => {
    it("should throw AssistantNotFoundError when assistant does not exist", async () => {
      vi.mocked(prisma.assistant.findFirst).mockResolvedValue(null);

      const useCase = new QuickDialCallUseCase(
        mockBolnaFactory as any,
        mockWalletRepo as any,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          assistantId: "asst-non-existent",
          phone: "+919876543210",
        }),
      ).rejects.toThrow(AssistantNotFoundError);
    });

    it("should throw InsufficientBalanceError when wallet balance is 0 or negative", async () => {
      vi.mocked(prisma.assistant.findFirst).mockResolvedValue({
        id: "asst-1",
        tenantId: "tenant-1",
        platformAgent: { bolnaId: "bolna-agent-1" },
      } as any);

      mockWalletRepo.findByTenantId.mockResolvedValue({
        cashBalance: 0,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      const useCase = new QuickDialCallUseCase(
        mockBolnaFactory as any,
        mockWalletRepo as any,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          assistantId: "asst-1",
          phone: "+919876543210",
        }),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it("should create lead, trigger Bolna call, and pre-create Call record with execution_id", async () => {
      vi.mocked(prisma.assistant.findFirst).mockResolvedValue({
        id: "asst-1",
        tenantId: "tenant-1",
        platformAgent: { bolnaId: "bolna-agent-1" },
      } as any);

      mockWalletRepo.findByTenantId.mockResolvedValue({
        cashBalance: 5000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: "lead-new-1",
        phone: "+919876543210",
        tenantId: "tenant-1",
        assistantId: "asst-1",
        campaignId: null,
        type: "OUTBOUND",
        source: "QUICK_DIAL",
        status: "CALLING",
      } as any);

      mockBolnaClient.calls.create.mockResolvedValue({
        execution_id: "exec-12345",
      });

      vi.mocked(prisma.call.create).mockResolvedValue({
        id: "call-new-1",
        bolnaCallId: "exec-12345",
        status: "PENDING",
      } as any);

      const useCase = new QuickDialCallUseCase(
        mockBolnaFactory as any,
        mockWalletRepo as any,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        assistantId: "asst-1",
        phone: "9876543210", // formatted to +919876543210
        name: "Alice",
        userData: { priority: "high" },
      });

      expect(result.leadId).toBe("lead-new-1");
      expect(result.callId).toBe("call-new-1");
      expect(result.executionId).toBe("exec-12345");

      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: "OUTBOUND",
          source: "QUICK_DIAL",
          assistantId: "asst-1",
          phone: "+919876543210",
          name: "Alice",
          status: "PENDING",
        }),
      });

      expect(mockBolnaClient.calls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: "bolna-agent-1",
          recipient_phone_number: "+919876543210",
          user_data: expect.objectContaining({
            customer_name: "Alice",
            priority: "high",
          }),
        }),
      );

      expect(prisma.call.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bolnaCallId: "exec-12345",
          assistantId: "asst-1",
          leadId: "lead-new-1",
          type: "OUTBOUND",
          source: "QUICK_DIAL",
          status: "PENDING",
        }),
      });
    });
  });

  describe("StopCallUseCase", () => {
    it("should throw CallNotFoundError when call does not exist", async () => {
      vi.mocked(prisma.call.findFirst).mockResolvedValue(null);

      const useCase = new StopCallUseCase(mockBolnaFactory as any);

      await expect(
        useCase.execute({ tenantId: "tenant-1", callId: "missing-call" }),
      ).rejects.toThrow(CallNotFoundError);
    });

    it("should throw CallCannotBeStoppedError when call is already completed", async () => {
      vi.mocked(prisma.call.findFirst).mockResolvedValue({
        id: "call-1",
        status: "COMPLETED",
      } as any);

      const useCase = new StopCallUseCase(mockBolnaFactory as any);

      await expect(
        useCase.execute({ tenantId: "tenant-1", callId: "call-1" }),
      ).rejects.toThrow(CallCannotBeStoppedError);
    });

    it("should call Bolna stop API and mark Call and Lead as STOPPED", async () => {
      vi.mocked(prisma.call.findFirst).mockResolvedValue({
        id: "call-1",
        leadId: "lead-1",
        bolnaCallId: "exec-123",
        status: "CALLING",
        callHistory: [],
      } as any);

      mockBolnaClient.calls.stop.mockResolvedValue({ success: true });

      vi.mocked(prisma.call.update).mockResolvedValue({
        id: "call-1",
        status: "STOPPED",
      } as any);

      vi.mocked(prisma.lead.update).mockResolvedValue({
        id: "lead-1",
        status: "STOPPED",
      } as any);

      const useCase = new StopCallUseCase(mockBolnaFactory as any);

      const result = await useCase.execute({
        tenantId: "tenant-1",
        callId: "call-1",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("STOPPED");
      expect(mockBolnaClient.calls.stop).toHaveBeenCalledWith("exec-123");
      expect(prisma.call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "call-1" },
          data: expect.objectContaining({ status: "STOPPED" }),
        }),
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lead-1" },
          data: expect.objectContaining({
            status: "STOPPED",
            stoppedReason: "MANUAL",
          }),
        }),
      );
    });
  });

  describe("InboundCallerMatchUseCase", () => {
    it("should auto-register unknown inbound caller as new Lead and Call when type is INBOUND", async () => {
      mockCallRepo.findInboundLeadContext.mockResolvedValue(null);

      vi.mocked(prisma.assistant.findFirst).mockResolvedValue({
        id: "asst-inbound-1",
        name: "Test Inbound Assistant",
        tenantId: "tenant-1",
        config: {
          welcome_message: "Hello! Thank you for calling our office.",
        },
        platformAgent: {
          type: "INBOUND",
        },
      } as any);

      // Caller not found in tenant leads
      vi.mocked(prisma.lead.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: "lead-inbound-new",
        phone: "+919876543210",
        tenantId: "tenant-1",
        assistantId: "asst-inbound-1",
        type: "INBOUND",
        source: "INBOUND",
        status: "CALLING",
      } as any);

      vi.mocked(prisma.call.create).mockResolvedValue({
        id: "call-inbound-new",
        bolnaCallId: "inbound-exec-999",
      } as any);

      const useCase = new InboundCallerMatchUseCase(mockCallRepo as any);

      const result = await useCase.execute({
        agentId: "bolna-agent-inbound",
        contactNumber: "+919876543210",
        executionId: "inbound-exec-999",
      });

      expect(result).toHaveProperty("welcome_message", "Hello! Thank you for calling our office.");
      expect(result).toHaveProperty("contact_number", "+919876543210");

      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: "+919876543210",
          tenantId: "tenant-1",
          assistantId: "asst-inbound-1",
          type: "INBOUND",
          source: "INBOUND",
        }),
      });

      expect(prisma.call.upsert).toHaveBeenCalledWith({
        where: { bolnaCallId: "inbound-exec-999" },
        create: expect.objectContaining({
          bolnaCallId: "inbound-exec-999",
          tenantId: "tenant-1",
          assistantId: "asst-inbound-1",
          leadId: "lead-inbound-new",
          type: "INBOUND",
          source: "INBOUND",
          status: "CALLING",
        }),
        update: {},
      });
    });

    it("should return empty object {} and not create call/lead when platform agent type is OUTBOUND", async () => {
      vi.mocked(prisma.assistant.findFirst).mockResolvedValue({
        id: "asst-outbound-1",
        name: "Outbound Only Assistant",
        tenantId: "tenant-1",
        platformAgent: {
          type: "OUTBOUND",
        },
      } as any);

      const useCase = new InboundCallerMatchUseCase(mockCallRepo as any);

      const result = await useCase.execute({
        agentId: "bolna-agent-outbound",
        contactNumber: "+919876543210",
        executionId: "inbound-exec-outbound",
      });

      expect(result).toEqual({});
      expect(mockCallRepo.findInboundLeadContext).not.toHaveBeenCalled();
      expect(prisma.lead.create).not.toHaveBeenCalled();
      expect(prisma.call.upsert).not.toHaveBeenCalled();
    });

    it("should return empty object {} when no assistant is found for agentId", async () => {
      vi.mocked(prisma.assistant.findFirst).mockResolvedValue(null);

      const useCase = new InboundCallerMatchUseCase(mockCallRepo as any);

      const result = await useCase.execute({
        agentId: "bolna-agent-unassigned",
        contactNumber: "+919876543210",
        executionId: "inbound-exec-unassigned",
      });

      expect(result).toEqual({});
      expect(mockCallRepo.findInboundLeadContext).not.toHaveBeenCalled();
      expect(prisma.lead.create).not.toHaveBeenCalled();
      expect(prisma.call.upsert).not.toHaveBeenCalled();
    });

    it("should allow caller when platform agent type is BOTH", async () => {
      mockCallRepo.findInboundLeadContext.mockResolvedValue(null);

      vi.mocked(prisma.assistant.findFirst).mockResolvedValue({
        id: "asst-both-1",
        name: "Dual Capability Assistant",
        tenantId: "tenant-1",
        config: {
          welcome_message: "Welcome to both inbound and outbound support!",
        },
        platformAgent: {
          type: "BOTH",
        },
      } as any);

      vi.mocked(prisma.lead.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: "lead-both-new",
        phone: "+919876543210",
        tenantId: "tenant-1",
        assistantId: "asst-both-1",
        type: "INBOUND",
        source: "INBOUND",
        status: "CALLING",
      } as any);

      const useCase = new InboundCallerMatchUseCase(mockCallRepo as any);

      const result = await useCase.execute({
        agentId: "bolna-agent-both",
        contactNumber: "+919876543210",
        executionId: "inbound-exec-both",
      });

      expect(result).toHaveProperty(
        "welcome_message",
        "Welcome to both inbound and outbound support!",
      );
      expect(prisma.lead.create).toHaveBeenCalled();
      expect(prisma.call.upsert).toHaveBeenCalled();
    });
  });

  describe("GetCallCenterStatsUseCase", () => {
    it("should return daily aggregated stats for tenant", async () => {
      const { GetCallCenterStatsUseCase } = await import(
        "../../../src/modules/calls/application/use-cases/get-call-center-stats.use-case"
      );

      const mockStatsRepo = {
        getCallCenterStats: vi.fn().mockResolvedValue({
          todayInboundCalls: 12,
          todayInboundCompleted: 10,
          todayOutboundCalls: 25,
          todayOutboundCompleted: 20,
          todayAvgDurationSec: 85,
          todayTotalCostPaisa: 54000,
          activeCallsCount: 2,
        }),
      };

      const useCase = new GetCallCenterStatsUseCase(mockStatsRepo as any);
      const stats = await useCase.execute("tenant-123");

      expect(mockStatsRepo.getCallCenterStats).toHaveBeenCalledWith("tenant-123");
      expect(stats.todayInboundCalls).toBe(12);
      expect(stats.todayOutboundCalls).toBe(25);
      expect(stats.activeCallsCount).toBe(2);
      expect(stats.todayAvgDurationSec).toBe(85);
    });
  });
});
