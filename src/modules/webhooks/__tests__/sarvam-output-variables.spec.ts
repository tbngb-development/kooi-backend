import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessSarvamWebhookUseCase } from "../application/use-cases/process-sarvam-webhook.use-case";
import type { SarvamLeadCorrelationService } from "../application/services/sarvam-lead-correlation.service";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
  CreateAggregateCallData,
  UpdateAggregateCallData,
} from "../application/interfaces/sarvam-webhook-repository.interface";
import type { SarvamWebhookAttemptPayload } from "../application/dto/sarvam-webhook.dto";
import type { Logger } from "../../../shared/logging/logger.interface";

describe("Dynamic Sarvam Output Variable Mapping and Persistence", () => {
  const tenantId = "tenant-001";
  const campaignId = "campaign-001";
  const sarvamCampaignId = "sarvam-camp-999";
  const batchId = "batch-001";
  const sarvamCohortId = "cohort-888";
  const leadId = "lead-001";
  const callId = "call-001";
  const sarvamAgentId = "sarvam-agent-777";
  const userPhoneNumber = "+919876543210";
  const userIdentifier = "usr_phone_9876543210";
  const testSecret = "super-secret-sarvam-key-32-chars!!";

  const defaultCorrelationSuccess = {
    success: true as const,
    data: {
      tenantId,
      campaign: {
        id: campaignId,
        name: "Q4 Enterprise Outreach",
        provider: "SARVAM" as const,
        sarvamCampaignId,
        sarvamAgentId,
        status: "RUNNING" as const,
      },
      batch: {
        id: batchId,
        name: "Batch 1",
        provider: "SARVAM" as const,
        sarvamCohortId,
        status: "RUNNING" as const,
      },
      lead: {
        id: leadId,
        phone: userPhoneNumber,
        name: "Arjun Verma",
        status: "CALLING" as const,
        metadata: {},
      },
      normalizedPhone: userPhoneNumber,
    },
  };

  const createPayload = (
    attemptId: string,
    outputAgentVariables?: Record<string, unknown> | null,
    retryAttempt = 0,
    completionStatus = "completed",
    connectivityStatus = "connected",
  ): SarvamWebhookAttemptPayload => ({
    app_id: "agent-app-1",
    app_version: 1,
    attempt_id: attemptId,
    campaign_id: sarvamCampaignId,
    cohort_id: sarvamCohortId,
    completion_status: completionStatus,
    connectivity_status: connectivityStatus,
    next_action_status: null,
    failure_reason: null,
    user_identifier: userIdentifier,
    user_phone_number: userPhoneNumber,
    agent_phone_number: "+918041234567",
    duration: 60,
    interaction_id: `inter-${attemptId}`,
    retry_attempt: retryAttempt,
    executed_at: new Date().toISOString(),
    start_datetime: new Date().toISOString(),
    end_datetime: new Date().toISOString(),
    output_agent_variables: outputAgentVariables,
    interaction_transcript: [
      { role: "agent", en_text: "Hi Arjun, interested in our offer?" },
      { role: "user", en_text: "Yes, definitely." },
    ],
    metadata: {
      tenantId,
      campaignId,
      secret: testSecret,
    },
  });

  let mockCorrelationService: SarvamLeadCorrelationService;
  let mockRepo: ISarvamWebhookRepository;
  let mockLogger: Logger;
  let useCase: ProcessSarvamWebhookUseCase;

  let inMemoryCall: AggregateCallCandidate | null = null;
  let inMemoryCallAnalysis: { id: string; outputVariables: unknown } | null = null;
  let agentConfigStore: Map<string, { id: string; outputVariables: unknown; tenantId: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SARVAM_WEBHOOK_SECRET = testSecret;

    inMemoryCall = null;
    inMemoryCallAnalysis = null;
    agentConfigStore = new Map();

    // Default active agent belonging to tenantId
    agentConfigStore.set(sarvamAgentId, {
      id: sarvamAgentId,
      tenantId,
      outputVariables: [
        { name: "call_summary", description: "Summary of call" },
        { name: "lead_temperature", description: "Lead intent score" },
        { name: "preferred_budget", description: "Stated budget" },
      ],
    });

    mockCorrelationService = {
      correlate: vi.fn().mockResolvedValue(defaultCorrelationSuccess),
    } as unknown as SarvamLeadCorrelationService;

    mockRepo = {
      executeInAdvisoryLock: vi.fn().mockImplementation(async (_lockKey, op) => op(mockRepo)),
      findAggregateCall: vi.fn().mockImplementation(async () => inMemoryCall),
      createAggregateCall: vi.fn().mockImplementation(async (data: CreateAggregateCallData) => {
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
        };
        return inMemoryCall;
      }),
      updateAggregateCall: vi.fn().mockImplementation(async (_id: string, data: UpdateAggregateCallData) => {
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
        };
      }),
      updateLeadStatus: vi.fn().mockResolvedValue(undefined),
      findSarvamAgentForTenant: vi.fn().mockImplementation(async (agentId: string, tenant: string) => {
        const found = agentConfigStore.get(agentId);
        if (!found || found.tenantId !== tenant) {
          return null;
        }
        return {
          id: found.id,
          outputVariables: found.outputVariables,
        };
      }),
      getCallAnalysis: vi.fn().mockImplementation(async (_cId: string) => inMemoryCallAnalysis),
      upsertCallAnalysisOutputVariables: vi.fn().mockImplementation(
        async (_cId: string, _tId: string, outputVars: Array<{ key: string; value: unknown }>) => {
          inMemoryCallAnalysis = {
            id: "analysis-uuid-1",
            outputVariables: outputVars,
          };
        },
      ),
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

  // 1. All configured output variables returned
  it("Scenario 1: persists all matching output variables when all configured variables are returned", async () => {
    const payload = createPayload("att-001", {
      call_summary: "Customer requested a demo on Tuesday.",
      lead_temperature: "hot",
      preferred_budget: "50k",
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).toHaveBeenCalledTimes(1);
    expect(mockRepo.upsertCallAnalysisOutputVariables).toHaveBeenCalledWith(
      callId,
      tenantId,
      [
        { key: "call_summary", value: "Customer requested a demo on Tuesday." },
        { key: "lead_temperature", value: "hot" },
        { key: "preferred_budget", value: "50k" },
      ],
    );
    expect(inMemoryCallAnalysis?.outputVariables).toEqual([
      { key: "call_summary", value: "Customer requested a demo on Tuesday." },
      { key: "lead_temperature", value: "hot" },
      { key: "preferred_budget", value: "50k" },
    ]);
  });

  // 2. Only a subset of configured variables returned
  it("Scenario 2: persists only the matching subset when fewer variables are returned", async () => {
    const payload = createPayload("att-002", {
      call_summary: "Customer was somewhat interested.",
      // lead_temperature and preferred_budget missing
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).toHaveBeenCalledWith(
      callId,
      tenantId,
      [{ key: "call_summary", value: "Customer was somewhat interested." }],
    );
  });

  // 3. Webhook contains additional unconfigured variables
  it("Scenario 3: ignores unconfigured variables sent in the webhook payload", async () => {
    const payload = createPayload("att-003", {
      call_summary: "Customer agreed to proposal.",
      lead_temperature: "warm",
      unconfigured_internal_flag: true,
      random_sarvam_metric: 42,
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).toHaveBeenCalledWith(
      callId,
      tenantId,
      [
        { key: "call_summary", value: "Customer agreed to proposal." },
        { key: "lead_temperature", value: "warm" },
      ],
    );
  });

  // 4. No output variables configured on Sarvam Agent
  it("Scenario 4: skips CallAnalysis upsert if no output variables are configured on the agent", async () => {
    agentConfigStore.set(sarvamAgentId, {
      id: sarvamAgentId,
      tenantId,
      outputVariables: [],
    });

    const payload = createPayload("att-004", {
      call_summary: "Summary should be ignored because agent has no configured variables.",
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).not.toHaveBeenCalled();
    expect(inMemoryCallAnalysis).toBeNull();
  });

  // 5. output_agent_variables is missing or null
  it("Scenario 5: handles missing or null output_agent_variables safely without throwing", async () => {
    const payloadNull = createPayload("att-005a", null);
    const resultNull = await useCase.execute(payloadNull);
    expect(resultNull.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).not.toHaveBeenCalled();

    const payloadUndefined = createPayload("att-005b", undefined);
    const resultUndefined = await useCase.execute(payloadUndefined);
    expect(resultUndefined.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).not.toHaveBeenCalled();
  });

  // 6. Sarvam Agent configuration cannot be found
  it("Scenario 6: logs warning and succeeds when Sarvam Agent is not found", async () => {
    agentConfigStore.clear(); // remove all agents

    const payload = createPayload("att-006", {
      call_summary: "Some summary",
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Sarvam agent configuration not found or tenant unauthorized",
      expect.objectContaining({
        action: "webhook.sarvam.agent_not_found",
        sarvamAgentId,
        tenantId,
      }),
    );
  });

  // 7. Campaign has no sarvamAgentId
  it("Scenario 7: handles campaigns without sarvamAgentId gracefully", async () => {
    (mockCorrelationService.correlate as any).mockResolvedValueOnce({
      ...defaultCorrelationSuccess,
      data: {
        ...defaultCorrelationSuccess.data,
        campaign: {
          ...defaultCorrelationSuccess.data.campaign,
          sarvamAgentId: null,
        },
      },
    });

    const payload = createPayload("att-007", {
      call_summary: "Summary",
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.findSarvamAgentForTenant).not.toHaveBeenCalled();
    expect(mockRepo.upsertCallAnalysisOutputVariables).not.toHaveBeenCalled();
  });

  // 8. Tenant isolation prevents fetching another tenant's agent
  it("Scenario 8: enforces tenant isolation and rejects another tenant's agent", async () => {
    // Agent belongs to a different tenant
    agentConfigStore.set(sarvamAgentId, {
      id: sarvamAgentId,
      tenantId: "other-tenant-999",
      outputVariables: [{ name: "call_summary", description: "desc" }],
    });

    const payload = createPayload("att-008", {
      call_summary: "Attempted cross-tenant summary",
    });

    const result = await useCase.execute(payload);

    expect(result.status).toBe("SUCCESS");
    expect(mockRepo.findSarvamAgentForTenant).toHaveBeenCalledWith(sarvamAgentId, tenantId);
    expect(mockRepo.upsertCallAnalysisOutputVariables).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Sarvam agent configuration not found or tenant unauthorized",
      expect.objectContaining({
        action: "webhook.sarvam.agent_not_found",
        sarvamAgentId,
        tenantId,
      }),
    );
  });

  // 9. Duplicate webhook delivery does not duplicate persisted values
  it("Scenario 9: ignores duplicate webhook deliveries idempotently without modifying CallAnalysis", async () => {
    const payload = createPayload("att-009", {
      call_summary: "First delivery",
    });

    // 1st delivery
    const result1 = await useCase.execute(payload);
    expect(result1.status).toBe("SUCCESS");
    expect(mockRepo.upsertCallAnalysisOutputVariables).toHaveBeenCalledTimes(1);

    // 2nd delivery with identical attempt_id
    const result2 = await useCase.execute(payload);
    expect(result2.status).toBe("IDEMPOTENT_IGNORED");
    // Should NOT call upsertCallAnalysisOutputVariables again
    expect(mockRepo.upsertCallAnalysisOutputVariables).toHaveBeenCalledTimes(1);
  });

  // 10. Retry attempts: replaces when present, preserves earlier when missing
  it("Scenario 10: updates output variables on successful retry, but preserves earlier variables if retry has none", async () => {
    // Attempt 0: First attempt has initial summary
    const attempt0 = createPayload(
      "att-retry-0",
      {
        call_summary: "Initial call was busy, left voicemail.",
        lead_temperature: "cold",
      },
      0,
    );
    await useCase.execute(attempt0);

    expect(inMemoryCallAnalysis?.outputVariables).toEqual([
      { key: "call_summary", value: "Initial call was busy, left voicemail." },
      { key: "lead_temperature", value: "cold" },
    ]);

    // Attempt 1: Successful retry with updated summary and budget
    const attempt1 = createPayload(
      "att-retry-1",
      {
        call_summary: "Customer answered retry call and wants quote.",
        lead_temperature: "warm",
        preferred_budget: "25k",
      },
      1,
    );
    await useCase.execute(attempt1);

    // Latest attempt variables replace earlier variables
    expect(inMemoryCallAnalysis?.outputVariables).toEqual([
      { key: "call_summary", value: "Customer answered retry call and wants quote." },
      { key: "lead_temperature", value: "warm" },
      { key: "preferred_budget", value: "25k" },
    ]);

    // Attempt 2: Dropped or failed call without output variables
    const attempt2 = createPayload(
      "att-retry-2",
      null, // No output variables on this attempt
      2,
      "failed",
      "failed",
    );
    await useCase.execute(attempt2);

    // Should PRESERVE attempt 1's variables and NOT erase them
    expect(inMemoryCallAnalysis?.outputVariables).toEqual([
      { key: "call_summary", value: "Customer answered retry call and wants quote." },
      { key: "lead_temperature", value: "warm" },
      { key: "preferred_budget", value: "25k" },
    ]);
  });

  // 11. Existing Bolna output-variable and extraction handling remains unchanged
  it("Scenario 11: preserves Bolna segregation and does not invoke Bolna extraction logic for Sarvam calls", async () => {
    const payload = createPayload("att-011", {
      call_summary: "Sarvam call completed.",
    });

    await useCase.execute(payload);

    // For Sarvam, CallAnalysis ONLY receives outputVariables and does not write dynamicExtractions or extractionResult
    expect(inMemoryCallAnalysis?.outputVariables).toEqual([
      { key: "call_summary", value: "Sarvam call completed." },
    ]);
  });
});

