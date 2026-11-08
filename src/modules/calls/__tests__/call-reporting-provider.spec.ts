import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListCallsUseCase } from "../application/use-cases/list-calls.use-case";
import { GetCallStatsUseCase } from "../application/use-cases/get-call-stats.use-case";
import { CallEntity } from "../domain/entities/call.entity";
import type { CallRepository, PaginatedCallsResult, CallStatsResult } from "../application/interfaces/call-repository.interface";

describe("Call Reporting & Provider Filtering", () => {
  let mockCallRepo: CallRepository;
  let listCallsUseCase: ListCallsUseCase;
  let getCallStatsUseCase: GetCallStatsUseCase;

  const tenantId = "tenant-reporting-1";

  beforeEach(() => {
    vi.clearAllMocks();

    mockCallRepo = {
      list: vi.fn().mockResolvedValue({
        overview: {
          totalCalls: 2,
          completedCalls: 2,
          failedCalls: 0,
          scheduledCalls: 0,
          busyCalls: 0,
          noAnswerCalls: 0,
          avgDurationSec: 50,
          totalCostPaisa: 300,
        },
        calls: [
          {
            id: "call-sarvam-1",
            provider: "SARVAM",
            sarvamAttemptId: "att-001",
            sarvamAgentId: "sarvam-agent-1",
            tenantId,
            campaignId: "camp-1",
            leadId: "lead-1",
            status: "COMPLETED",
            duration: 45,
            chargedAmount: 150,
            billableSeconds: 60,
            platformCost: 120,
            appliedRate: 150,
            lead: { id: "lead-1", name: "Rohan Gupta", phone: "+919876543210" },
            campaign: { id: "camp-1", name: "Q1 Campaign" },
            agent: { id: "sarvam-agent-1", name: "Hindi Agent" },
            extractionOverview: [],
            extractionInsights: [],
          },
        ],
        pagination: { total: 1, page: 1, limit: 15, pages: 1 },
      } as unknown as PaginatedCallsResult),
      getStats: vi.fn().mockResolvedValue({
        total: 10,
        completed: 8,
        failed: 1,
        noAnswer: 1,
        busy: 0,
        avgDuration: 48,
      } as CallStatsResult),
    } as unknown as CallRepository;

    listCallsUseCase = new ListCallsUseCase(mockCallRepo);
    getCallStatsUseCase = new GetCallStatsUseCase(mockCallRepo);
  });

  it("passes provider filter to CallRepository.list for SARVAM calls", async () => {
    await listCallsUseCase.execute({
      tenantId,
      provider: "SARVAM",
      campaignId: "camp-1",
    });

    expect(mockCallRepo.list).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      provider: "SARVAM",
      campaignId: "camp-1",
    }));
  });

  it("passes provider filter to CallRepository.list for BOLNA calls", async () => {
    await listCallsUseCase.execute({
      tenantId,
      provider: "BOLNA",
    });

    expect(mockCallRepo.list).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      provider: "BOLNA",
    }));
  });

  it("passes agentId filter to CallRepository.list", async () => {
    await listCallsUseCase.execute({
      tenantId,
      agentId: "agent-uuid-999",
      campaignId: "camp-1",
    });

    expect(mockCallRepo.list).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        campaignId: "camp-1",
        agentId: "agent-uuid-999",
      }),
    );
  });

  it("passes goalId and goalPassed filters to CallRepository.list", async () => {
    await listCallsUseCase.execute({
      tenantId,
      campaignId: "camp-1",
      goalId: "goal-uuid-1",
      goalPassed: true,
    });

    expect(mockCallRepo.list).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        campaignId: "camp-1",
        goalId: "goal-uuid-1",
        goalPassed: true,
      }),
    );
  });

  it("passes goalPassed=false filter to CallRepository.list", async () => {
    await listCallsUseCase.execute({
      tenantId,
      campaignId: "camp-1",
      goalPassed: false,
    });

    expect(mockCallRepo.list).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        campaignId: "camp-1",
        goalPassed: false,
      }),
    );
  });

  it("passes provider filter to CallRepository.getStats", async () => {
    await getCallStatsUseCase.execute({
      tenantId,
      provider: "SARVAM",
      campaignId: "camp-1",
    });

    expect(mockCallRepo.getStats).toHaveBeenCalledWith(tenantId, {
      provider: "SARVAM",
      campaignId: "camp-1",
      leadId: undefined,
    });
  });

  it("CallEntity maps sarvamAgentId, provider, and financial fields correctly", () => {
    const entity = new CallEntity({
      id: "call-1",
      provider: "SARVAM",
      bolnaCallId: null,
      sarvamAttemptId: "att-123",
      sarvamInteractionId: "inter-456",
      sarvamUserIdentifier: "usr-789",
      sarvamAgentId: "agent-sarvam-1",
      tenantId,
      campaignId: "camp-1",
      batchId: null,
      leadId: "lead-1",
      status: "COMPLETED",
      duration: 65,
      cost: null,
      platformCost: 150,
      billableSeconds: 75,
      appliedRate: 150,
      chargedAmount: 188,
      recording: null,
      transcript: null,
      transcriptMessages: null,
      summary: null,
      callHistory: [],
      extractionResult: null,
      startedAt: new Date(),
      endedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
      deletedAt: null,
    });

    expect(entity.provider).toBe("SARVAM");
    expect(entity.sarvamAttemptId).toBe("att-123");
    expect(entity.sarvamInteractionId).toBe("inter-456");
    expect(entity.sarvamUserIdentifier).toBe("usr-789");
    expect(entity.sarvamAgentId).toBe("agent-sarvam-1");
    expect(entity.chargedAmount).toBe(188);
    expect(entity.billableSeconds).toBe(75);
    expect(entity.platformCost).toBe(150);
  });
});
