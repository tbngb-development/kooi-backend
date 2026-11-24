import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessSarvamWebhookUseCase } from "../application/use-cases/process-sarvam-webhook.use-case";
import type { SarvamLeadCorrelationService } from "../application/services/sarvam-lead-correlation.service";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
  CampaignGoalSnapshot,
} from "../application/interfaces/sarvam-webhook-repository.interface";
import type { Logger } from "../../../shared/logging/logger.interface";
import { CallStatus, LeadStatus } from "@prisma/client";

describe("Phase 4: Sarvam Webhook Goal Evaluation Suite", () => {
  let useCase: ProcessSarvamWebhookUseCase;
  let mockCorrelationService: SarvamLeadCorrelationService;
  let mockRepo: ISarvamWebhookRepository;
  let mockLogger: Logger;

  const tenantId = "tenant-uuid-123";
  const campaignId = "campaign-uuid-456";
  const batchId = "batch-uuid-789";
  const leadId = "lead-uuid-101";
  const callId = "call-uuid-202";
  const sarvamAgentId = "agent-uuid-303";
  const testSecret = "webhook-secret-token";

  const sarvamCampaignId = "sarvam-camp-ext-1";
  const sarvamCohortId = "sarvam-cohort-ext-2";
  const userPhoneNumber = "+919876543210";
  const userIdentifier = "sarvam-user-001";

  let inMemoryCall: AggregateCallCandidate | null = null;
  let recordedGoalResults: Array<{ callId: string; campaignGoalId: string; attemptId: string }> = [];
  let configuredGoals: CampaignGoalSnapshot[] = [];

  const basePayload = {
    app_id: sarvamAgentId,
    app_version: 1,
    attempt_id: "attempt-uuid-001",
    campaign_id: sarvamCampaignId,
    cohort_id: sarvamCohortId,
    user_identifier: userIdentifier,
    user_phone_number: userPhoneNumber,
    agent_phone_number: "+918041234567",
    connectivity_status: "connected",
    completion_status: "completed",
    duration: 120,
    start_datetime: "2026-03-30T10:00:00Z",
    end_datetime: "2026-03-30T10:02:00Z",
    output_agent_variables: {
      customer_interest: "interested",
      budget_match: "yes",
    },
    metadata: {
      tenantId,
      campaignId,
      batchId,
      leadId,
      secret: testSecret,
    },
  };

  beforeEach(() => {
    inMemoryCall = null;
    recordedGoalResults = [];
    configuredGoals = [
      {
        id: "goal-1",
        campaignId,
        outputVariableName: "customer_interest",
        expectedValue: "interested",
        displayName: "Interested Customer",
      },
      {
        id: "goal-2",
        campaignId,
        outputVariableName: "budget_match",
        expectedValue: "yes",
        displayName: "Budget Matched",
      },
    ];

    mockCorrelationService = {
      correlate: vi.fn().mockResolvedValue({
        success: true,
        data: {
          tenantId,
          campaign: { id: campaignId, sarvamAgentId, provider: "SARVAM", sarvamCampaignId, status: "RUNNING" },
          batch: { id: batchId, provider: "SARVAM", sarvamCohortId, status: "RUNNING" },
          lead: { id: leadId, phone: userPhoneNumber, status: "CALLING" },
          normalizedPhone: userPhoneNumber,
        },
      }),
    } as unknown as SarvamLeadCorrelationService;

    mockRepo = {
      executeInAdvisoryLock: vi.fn().mockImplementation(async (_lockKey, op) => op(mockRepo)),
      findAggregateCall: vi.fn().mockImplementation(async () => inMemoryCall),
      createAggregateCall: vi.fn().mockImplementation(async (data) => {
        inMemoryCall = {
          id: callId,
          tenantId: data.tenantId,
          campaignId: data.campaignId,
          batchId: data.batchId,
          leadId: data.leadId,
          provider: data.provider,
          status: data.status,
          sarvamAttemptId: data.sarvamAttemptId,
          sarvamInteractionId: data.sarvamInteractionId ?? null,
          sarvamUserIdentifier: data.sarvamUserIdentifier,
          duration: data.duration ?? null,
          recording: null,
          transcript: data.transcript ?? null,
          transcriptMessages: data.transcriptMessages ?? null,
          callHistory: data.callHistory,
          extractionResult: data.extractionResult ?? null,
          startedAt: data.startedAt ?? null,
          endedAt: data.endedAt ?? null,
          agentNumber: data.agentNumber ?? null,
          goalPassed: data.goalPassed ?? false,
        };
        return inMemoryCall;
      }),
      updateAggregateCall: vi.fn().mockImplementation(async (_id, data) => {
        if (!inMemoryCall) return;
        inMemoryCall = {
          ...inMemoryCall,
          status: data.status,
          sarvamAttemptId: data.sarvamAttemptId,
          sarvamInteractionId: data.sarvamInteractionId ?? inMemoryCall.sarvamInteractionId,
          sarvamUserIdentifier: data.sarvamUserIdentifier,
          callHistory: data.callHistory,
          duration: data.duration ?? inMemoryCall.duration,
          startedAt: data.startedAt ?? inMemoryCall.startedAt,
          endedAt: data.endedAt ?? inMemoryCall.endedAt,
          transcript: data.transcript ?? inMemoryCall.transcript,
          transcriptMessages: data.transcriptMessages ?? inMemoryCall.transcriptMessages,
          extractionResult: data.extractionResult ?? inMemoryCall.extractionResult,
          agentNumber: data.agentNumber ?? inMemoryCall.agentNumber,
          goalPassed: data.goalPassed !== undefined ? data.goalPassed : inMemoryCall.goalPassed,
        };
      }),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      findSarvamAgentForTenant: vi.fn().mockResolvedValue({
        id: sarvamAgentId,
        outputVariables: [
          { key: "customer_interest", type: "enum", possibleValues: ["interested", "not_interested"] },
          { key: "budget_match", type: "enum", possibleValues: ["yes", "no"] },
        ],
      }),
      getCallAnalysis: vi.fn().mockResolvedValue(null),
      upsertCallAnalysisOutputVariables: vi.fn().mockResolvedValue(undefined),
      findCampaignGoals: vi.fn().mockImplementation(async () => configuredGoals),
      upsertCallGoalResults: vi.fn().mockImplementation(async (cId: string, matches: Array<{ campaignGoalId: string; attemptId: string }>) => {
        for (const m of matches) {
          const existing = recordedGoalResults.find(
            (r) => r.callId === cId && r.campaignGoalId === m.campaignGoalId,
          );
          if (!existing) {
            recordedGoalResults.push({ callId: cId, campaignGoalId: m.campaignGoalId, attemptId: m.attemptId });
          }
        }
      }),
      markCallGoalPassed: vi.fn().mockImplementation(async () => {
        if (inMemoryCall) {
          inMemoryCall.goalPassed = true;
        }
      }),
    } as unknown as ISarvamWebhookRepository;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    useCase = new ProcessSarvamWebhookUseCase(
      mockCorrelationService,
      mockRepo,
      mockLogger,
      testSecret,
    );
  });

  it("evaluates matching goals and sets goalPassed to true with CallGoalResults", async () => {
    const result = await useCase.execute(basePayload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.findCampaignGoals).toHaveBeenCalledWith(campaignId);
    expect(mockRepo.upsertCallGoalResults).toHaveBeenCalledWith(callId, [
      { campaignGoalId: "goal-1", attemptId: "attempt-uuid-001" },
      { campaignGoalId: "goal-2", attemptId: "attempt-uuid-001" },
    ]);
    expect(mockRepo.markCallGoalPassed).toHaveBeenCalledWith(callId);
    expect(inMemoryCall?.goalPassed).toBe(true);
    expect(recordedGoalResults).toHaveLength(2);
  });

  it("does not pass goals when returned variable values do not match expected values", async () => {
    const payload = {
      ...basePayload,
      output_agent_variables: {
        customer_interest: "not_interested",
        budget_match: "no",
      },
    };

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.findCampaignGoals).toHaveBeenCalledWith(campaignId);
    expect(mockRepo.upsertCallGoalResults).not.toHaveBeenCalled();
    expect(mockRepo.markCallGoalPassed).not.toHaveBeenCalled();
    expect(inMemoryCall?.goalPassed).toBe(false);
    expect(recordedGoalResults).toHaveLength(0);
  });

  it("skips goal evaluation if connectivity_status is not connected", async () => {
    const payload = {
      ...basePayload,
      connectivity_status: "no_answer",
      completion_status: "failed",
    };

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.findCampaignGoals).not.toHaveBeenCalled();
    expect(mockRepo.upsertCallGoalResults).not.toHaveBeenCalled();
    expect(inMemoryCall?.goalPassed).toBe(false);
  });

  it("preserves goalPassed: true across retries when earlier attempt met a goal", async () => {
    // Attempt 1 passes goal-1
    await useCase.execute(basePayload);
    expect(inMemoryCall?.goalPassed).toBe(true);

    // Attempt 2 fails all goals
    const attempt2Payload = {
      ...basePayload,
      attempt_id: "attempt-uuid-002",
      output_agent_variables: {
        customer_interest: "not_interested",
        budget_match: "no",
      },
    };

    await useCase.execute(attempt2Payload);

    // Call still has goalPassed: true!
    expect(inMemoryCall?.goalPassed).toBe(true);
    // Recorded goal results from attempt 1 remain intact!
    expect(recordedGoalResults).toHaveLength(2);
  });
});
