import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessSarvamWebhookUseCase } from "../application/use-cases/process-sarvam-webhook.use-case";
import { SarvamLifecycleService } from "../application/services/sarvam-lifecycle.service";
import type { SarvamLeadCorrelationService } from "../application/services/sarvam-lead-correlation.service";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
  SarvamAttemptHistoryEntry,
  CreateAggregateCallData,
  UpdateAggregateCallData,
} from "../application/interfaces/sarvam-webhook-repository.interface";
import type { SarvamWebhookAttemptPayload } from "../application/dto/sarvam-webhook.dto";
import type { BatchStatus, CampaignStatus, CallStatus } from "@prisma/client";
import type { Logger } from "../../../shared/logging/logger.interface";

describe("Sarvam Call Execution Identity, Retry Handling, and Lifecycle", () => {
  const tenantId = "tenant-uuid-1";
  const campaignId = "camp-uuid-1";
  const sarvamCampaignId = "sarvam-camp-100";
  const sarvamAgentId = "agent-sarvam-1";
  const testSecret = "webhook-test-secret";

  const leadId = "lead-uuid-1";
  const userPhoneNumber = "+919876543210";

  const batch1Id = "batch-uuid-1";
  const sarvamCohort1Id = "sarvam-cohort-101";

  const batch2Id = "batch-uuid-2";
  const sarvamCohort2Id = "sarvam-cohort-202";

  // In-memory databases
  let callsDatabase: Map<string, AggregateCallCandidate>;
  let batchStore: Map<
    string,
    { id: string; status: BatchStatus; retryConfig: unknown; campaignId: string; completedAt?: Date }
  >;
  let campaignStore: Map<string, { id: string; status: CampaignStatus; completedAt?: Date }>;
  let leadStore: Map<string, { id: string; status: string; batchId: string }>;

  let mockCorrelationService: SarvamLeadCorrelationService;
  let mockRepo: ISarvamWebhookRepository;
  let lifecycleService: SarvamLifecycleService;
  let useCase: ProcessSarvamWebhookUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SARVAM_WEBHOOK_SECRET = testSecret;

    callsDatabase = new Map();
    batchStore = new Map([
      [
        batch1Id,
        {
          id: batch1Id,
          status: "RUNNING" as BatchStatus,
          retryConfig: { enabled: true, max_retries: 2, retry_on_statuses: ["no-answer", "busy", "failed"] },
          campaignId,
        },
      ],
      [
        batch2Id,
        {
          id: batch2Id,
          status: "RUNNING" as BatchStatus,
          retryConfig: { enabled: true, max_retries: 2, retry_on_statuses: ["no-answer", "busy", "failed"] },
          campaignId,
        },
      ],
    ]);
    campaignStore = new Map([
      [
        campaignId,
        {
          id: campaignId,
          status: "RUNNING" as CampaignStatus,
        },
      ],
    ]);
    leadStore = new Map([
      [leadId, { id: leadId, status: "CALLING", batchId: batch1Id }],
    ]);

    mockCorrelationService = {
      correlate: vi.fn().mockImplementation(async (input) => {
        const isCohort2 = input.sarvamCohortId === sarvamCohort2Id;
        const currentBatchId = isCohort2 ? batch2Id : batch1Id;
        const currentCohortId = isCohort2 ? sarvamCohort2Id : sarvamCohort1Id;

        return {
          success: true,
          data: {
            tenantId,
            campaign: {
              id: campaignId,
              name: "Q1 Outreach",
              provider: "SARVAM" as const,
              sarvamCampaignId,
              sarvamAgentId,
              status: campaignStore.get(campaignId)?.status ?? "RUNNING",
            },
            batch: {
              id: currentBatchId,
              name: isCohort2 ? "Batch 2" : "Batch 1",
              provider: "SARVAM" as const,
              sarvamCohortId: currentCohortId,
              status: batchStore.get(currentBatchId)?.status ?? "RUNNING",
            },
            lead: {
              id: leadId,
              phone: userPhoneNumber,
              name: "Priya Sharma",
              status: leadStore.get(leadId)?.status ?? "CALLING",
            },
            normalizedPhone: userPhoneNumber,
          },
        };
      }),
    } as unknown as SarvamLeadCorrelationService;

    mockRepo = {
      executeInAdvisoryLock: vi.fn().mockImplementation(async (_lockKey, op) => {
        return op(mockRepo);
      }),

      findAggregateCall: vi.fn().mockImplementation(async (lId: string, bId: string) => {
        // Look up by (leadId, batchId)
        for (const call of callsDatabase.values()) {
          if (call.leadId === lId && call.batchId === bId && call.provider === "SARVAM") {
            return call;
          }
        }
        return null;
      }),

      createAggregateCall: vi.fn().mockImplementation(async (data: CreateAggregateCallData) => {
        const id = `call-${callsDatabase.size + 1}`;
        const newCall: AggregateCallCandidate = {
          id,
          tenantId: data.tenantId,
          campaignId: data.campaignId,
          leadId: data.leadId,
          batchId: data.batchId,
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
          chargedAmount: data.chargedAmount ?? null,
          billableSeconds: data.billableSeconds ?? null,
          platformCost: data.platformCost ?? null,
        };
        callsDatabase.set(id, newCall);
        return newCall;
      }),

      updateAggregateCall: vi.fn().mockImplementation(async (id: string, data: UpdateAggregateCallData) => {
        const existing = callsDatabase.get(id);
        if (!existing) return;
        const updated: AggregateCallCandidate = {
          ...existing,
          status: data.status,
          sarvamAttemptId: data.sarvamAttemptId,
          sarvamInteractionId: data.sarvamInteractionId ?? existing.sarvamInteractionId,
          sarvamUserIdentifier: data.sarvamUserIdentifier,
          callHistory: data.callHistory,
          duration: data.duration ?? existing.duration,
          startedAt: data.startedAt ?? existing.startedAt,
          endedAt: data.endedAt ?? existing.endedAt,
          transcript: data.transcript ?? existing.transcript,
          transcriptMessages: data.transcriptMessages ?? existing.transcriptMessages,
          extractionResult: data.extractionResult ?? existing.extractionResult,
          agentNumber: data.agentNumber ?? existing.agentNumber,
          chargedAmount: data.chargedAmount ?? existing.chargedAmount,
          billableSeconds: data.billableSeconds ?? existing.billableSeconds,
          platformCost: data.platformCost ?? existing.platformCost,
        };
        callsDatabase.set(id, updated);
      }),

      updateLeadStatus: vi.fn().mockImplementation(async (lId: string, status: string) => {
        const lead = leadStore.get(lId);
        if (lead) {
          leadStore.set(lId, { ...lead, status });
        }
      }),

      countActiveLeadsInBatch: vi.fn().mockImplementation(async (bId: string) => {
        let count = 0;
        for (const lead of leadStore.values()) {
          if (lead.batchId === bId && (lead.status === "PENDING" || lead.status === "CALLING")) {
            count++;
          }
        }
        return count;
      }),

      countActiveCallsInBatch: vi.fn().mockImplementation(async (bId: string) => {
        let count = 0;
        for (const call of callsDatabase.values()) {
          if (
            call.batchId === bId &&
            (call.status === "SCHEDULED" || call.status === "CALLING" || call.status === "PENDING")
          ) {
            count++;
          }
        }
        return count;
      }),

      getBatchWithRetryConfig: vi.fn().mockImplementation(async (bId: string) => {
        const batch = batchStore.get(bId);
        if (!batch) return null;
        const camp = campaignStore.get(batch.campaignId);
        return {
          ...batch,
          campaign: camp
            ? {
                status: camp.status,
                endTimestamp: (camp as any).endTimestamp ?? null,
              }
            : null,
        };
      }),

      markPendingLeadsAsStopped: vi
        .fn()
        .mockImplementation(async (bId: string) => {
          let count = 0;
          for (const [id, lead] of leadStore.entries()) {
            if (lead.batchId === bId && lead.status === "PENDING") {
              leadStore.set(id, { ...lead, status: "STOPPED" });
              count++;
            }
          }
          return count;
        }),

      countStoppedLeadsInBatch: vi.fn().mockImplementation(async (bId: string) => {
        let count = 0;
        for (const lead of leadStore.values()) {
          if (lead.batchId === bId && lead.status === "STOPPED") {
            count++;
          }
        }
        return count;
      }),

      getCallsInBatch: vi.fn().mockImplementation(async (bId: string) => {
        const result: Array<{ id: string; status: CallStatus; callHistory: unknown }> = [];
        for (const call of callsDatabase.values()) {
          if (call.batchId === bId) {
            result.push({
              id: call.id,
              status: call.status,
              callHistory: call.callHistory,
            });
          }
        }
        return result;
      }),

      updateBatchStatus: vi.fn().mockImplementation(async (bId: string, status: BatchStatus, completedAt?: Date) => {
        const batch = batchStore.get(bId);
        if (batch) {
          batchStore.set(bId, { ...batch, status, completedAt });
        }
      }),

      getAllBatchStatuses: vi.fn().mockImplementation(async (_cId: string) => {
        return Array.from(batchStore.values()).map((b) => b.status);
      }),

      updateCampaignStatus: vi.fn().mockImplementation(async (cId: string, status: CampaignStatus, completedAt?: Date) => {
        const campaign = campaignStore.get(cId);
        if (campaign) {
          campaignStore.set(cId, { ...campaign, status, completedAt });
        }
      }),

      recalculateCampaignStats: vi.fn().mockResolvedValue(undefined),
      findSarvamAgentForTenant: vi.fn().mockResolvedValue(null),
      getCallAnalysis: vi.fn().mockResolvedValue(null),
      upsertCallAnalysisOutputVariables: vi.fn().mockResolvedValue(undefined),
      findCampaignGoals: vi.fn().mockResolvedValue([]),
      upsertCallGoalResults: vi.fn().mockResolvedValue(undefined),
      markCallGoalPassed: vi.fn().mockResolvedValue(undefined),
    } as unknown as ISarvamWebhookRepository;

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    const mockRecordingQueue = {
      add: vi.fn().mockResolvedValue({ id: "mock-job-1" }),
    };

    lifecycleService = new SarvamLifecycleService(mockRepo, mockLogger);

    useCase = new ProcessSarvamWebhookUseCase(
      mockCorrelationService,
      mockRepo,
      mockLogger,
      testSecret,
      mockRecordingQueue as any,
      undefined,
      undefined,
      lifecycleService,
    );
  });

  describe("1. Execution Identity Isolation across Batches", () => {
    it("creates independent Call 1 and Call 2 when the same contact is uploaded across Batch 1 and Batch 2", async () => {
      // ── Step 1: Batch 1 / Cohort 1 execution completes
      const batch1Payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-batch-1-001",
        interaction_id: "inter-b1-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        next_action_status: null,
        retry_attempt: 0,
        duration: 120,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        output_agent_variables: { interest_level: "high" },
        interaction_transcript: [
          { role: "agent", en_text: "Hi Priya from Batch 1" },
          { role: "user", en_text: "I am interested!" },
        ],
        metadata: { secret: testSecret },
      };

      const result1 = await useCase.execute(batch1Payload);
      expect(result1.status).toBe("SUCCESS");
      expect(result1.callId).toBe("call-1");

      const call1 = callsDatabase.get("call-1");
      expect(call1).toBeDefined();
      expect(call1?.batchId).toBe(batch1Id);
      expect(call1?.status).toBe("COMPLETED");
      expect(call1?.duration).toBe(120);
      expect(call1?.transcript).toContain("Hi Priya from Batch 1");
      expect((call1?.callHistory as SarvamAttemptHistoryEntry[])).toHaveLength(1);

      // ── Step 2: Same contact uploaded in Batch 2 / Cohort 2 executes
      // Simulate lead re-assigned to Batch 2
      leadStore.set(leadId, { id: leadId, status: "CALLING", batchId: batch2Id });

      const batch2Payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-batch-2-001",
        interaction_id: "inter-b2-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort2Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        duration: 45,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        output_agent_variables: { interest_level: "low" },
        interaction_transcript: [
          { role: "agent", en_text: "Hi Priya from Batch 2 follow-up" },
          { role: "user", en_text: "Not interested now." },
        ],
        metadata: { secret: testSecret },
      };

      const result2 = await useCase.execute(batch2Payload);
      expect(result2.status).toBe("SUCCESS");
      expect(result2.callId).toBe("call-2");

      // Verify Call 2 was created independently
      const call2 = callsDatabase.get("call-2");
      expect(call2).toBeDefined();
      expect(call2?.id).toBe("call-2");
      expect(call2?.batchId).toBe(batch2Id);
      expect(call2?.duration).toBe(45);
      expect(call2?.transcript).toContain("Hi Priya from Batch 2 follow-up");
      expect(call2?.extractionResult).toEqual({ interest_level: "low" });
      expect((call2?.callHistory as SarvamAttemptHistoryEntry[])).toHaveLength(1);

      // Verify Call 1 remains COMPLETELY UNCHANGED
      const pristineCall1 = callsDatabase.get("call-1");
      expect(pristineCall1?.batchId).toBe(batch1Id);
      expect(pristineCall1?.duration).toBe(120);
      expect(pristineCall1?.status).toBe("COMPLETED");
      expect(pristineCall1?.transcript).toContain("Hi Priya from Batch 1");
      expect(pristineCall1?.transcript).not.toContain("Batch 2");
      expect(pristineCall1?.extractionResult).toEqual({ interest_level: "high" });
      expect((pristineCall1?.callHistory as SarvamAttemptHistoryEntry[])).toHaveLength(1);
    });

    it("scopes PostgreSQL advisory lock to (leadId, batchId)", async () => {
      const payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-lock-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(payload);

      expect(mockRepo.executeInAdvisoryLock).toHaveBeenCalledWith(
        `sarvam-call:${leadId}:${batch1Id}`,
        expect.any(Function),
      );
    });
  });

  describe("2. Retry Handling within the Same Execution", () => {
    it("appends retry attempt to existing Call record and updates status without creating a new Call", async () => {
      // Attempt 0: No Answer with retry scheduled
      const attempt0: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-retry-000",
        interaction_id: "inter-000",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        retry_attempt: 0,
        connectivity_status: "no_answer",
        completion_status: "failed",
        next_action_status: "retry",
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        duration: 0,
        metadata: { secret: testSecret },
      };

      const res0 = await useCase.execute(attempt0);
      expect(res0.status).toBe("SUCCESS");
      expect(res0.callId).toBe("call-1");

      const callAfter0 = callsDatabase.get("call-1");
      expect(callAfter0?.status).toBe("NO_ANSWER");
      expect((callAfter0?.callHistory as SarvamAttemptHistoryEntry[])).toHaveLength(1);

      // Attempt 1: Connected and Completed
      const attempt1: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-retry-001",
        interaction_id: "inter-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        retry_attempt: 1,
        connectivity_status: "connected",
        completion_status: "completed",
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        duration: 75,
        interaction_transcript: [
          { role: "agent", en_text: "Thank you for picking up." },
        ],
        metadata: { secret: testSecret },
      };

      const res1 = await useCase.execute(attempt1);
      expect(res1.status).toBe("SUCCESS");
      expect(res1.callId).toBe("call-1"); // Still call-1!

      // Total calls in database remains 1
      expect(callsDatabase.size).toBe(1);

      const callAfter1 = callsDatabase.get("call-1");
      expect(callAfter1?.status).toBe("COMPLETED");
      expect(callAfter1?.duration).toBe(75);
      expect(callAfter1?.sarvamAttemptId).toBe("att-retry-001");
      const history = callAfter1?.callHistory as SarvamAttemptHistoryEntry[];
      expect(history).toHaveLength(2);
      expect(history[0].attempt_id).toBe("att-retry-000");
      expect(history[1].attempt_id).toBe("att-retry-001");
    });

    it("idempotently ignores duplicate webhook delivery for the same attempt_id", async () => {
      const payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-dup-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      const res1 = await useCase.execute(payload);
      expect(res1.status).toBe("SUCCESS");

      // Deliver exact same attempt_id again
      const res2 = await useCase.execute(payload);
      expect(res2.status).toBe("IDEMPOTENT_IGNORED");
      expect(res2.attemptId).toBe("att-dup-001");

      const call = callsDatabase.get("call-1");
      expect((call?.callHistory as SarvamAttemptHistoryEntry[])).toHaveLength(1);
    });
  });

  describe("3. Batch & Campaign Lifecycle Reconciliation", () => {
    it("keeps Batch in RUNNING while an execution has pending retries scheduled", async () => {
      const retryPendingPayload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-pending-retry-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        retry_attempt: 0, // max is 2
        connectivity_status: "no_answer",
        completion_status: "failed",
        next_action_status: "retry", // Pending retry!
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(retryPendingPayload);

      // Batch must remain RUNNING because next_action_status is retry and attempt < max_retries
      expect(batchStore.get(batch1Id)?.status).toBe("RUNNING");
      expect(batchStore.get(batch1Id)?.completedAt).toBeUndefined();
    });

    it("transitions Batch to COMPLETED and records completedAt when all executions finish", async () => {
      // Simulate that the call completes and lead is marked COMPLETED
      const finalPayload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-final-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        retry_attempt: 0,
        connectivity_status: "connected",
        completion_status: "completed",
        next_action_status: null, // Terminal, no retry
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(finalPayload);

      // Active leads count is now 0 (lead updated to COMPLETED), active calls is 0, no retries pending
      expect(batchStore.get(batch1Id)?.status).toBe("COMPLETED");
      expect(batchStore.get(batch1Id)?.completedAt).toBeInstanceOf(Date);
    });

    it("transitions Batch to FAILED when 100% of calls in the batch ended in FAILED", async () => {
      const failedPayload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-failed-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        retry_attempt: 2, // max attempts reached
        connectivity_status: "failed",
        completion_status: "failed",
        next_action_status: null, // No more retries
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(failedPayload);

      expect(batchStore.get(batch1Id)?.status).toBe("FAILED");
      expect(batchStore.get(batch1Id)?.completedAt).toBeInstanceOf(Date);
    });

    it("transitions Campaign to COMPLETED and calls recalculateCampaignStats when all batches finish", async () => {
      // Mark Batch 1 as already COMPLETED
      batchStore.set(batch1Id, {
        id: batch1Id,
        status: "COMPLETED",
        retryConfig: null,
        campaignId,
        completedAt: new Date(),
      });

      // Now Batch 2 finishes its execution
      leadStore.set(leadId, { id: leadId, status: "CALLING", batchId: batch2Id });

      const batch2FinalPayload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-b2-final-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort2Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(batch2FinalPayload);

      // Both batches are now terminal
      expect(batchStore.get(batch1Id)?.status).toBe("COMPLETED");
      expect(batchStore.get(batch2Id)?.status).toBe("COMPLETED");

      // Campaign must be COMPLETED
      expect(campaignStore.get(campaignId)?.status).toBe("COMPLETED");
      expect(campaignStore.get(campaignId)?.completedAt).toBeInstanceOf(Date);

      // Recalculate stats must have been called
      expect(mockRepo.recalculateCampaignStats).toHaveBeenCalledWith(campaignId);
    });

    it("does not reactivate PAUSED campaign to RUNNING when webhook arrives on in-flight call", async () => {
      // Parent campaign was paused by user
      campaignStore.set(campaignId, {
        id: campaignId,
        status: "PAUSED",
      });

      // An in-flight call completes
      leadStore.set(leadId, { id: leadId, status: "CALLING", batchId: batch1Id });

      const payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-paused-camp-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(payload);

      // Campaign must REMAIN PAUSED, not flipped back to RUNNING
      expect(campaignStore.get(campaignId)?.status).toBe("PAUSED");
    });

    it("marks batch as STOPPED (not COMPLETED) when call finishes on expired campaign with uncalled leads remaining", async () => {
      // Campaign has expired
      campaignStore.set(campaignId, {
        id: campaignId,
        status: "COMPLETED",
        endTimestamp: new Date(Date.now() - 3600000), // 1 hour ago
      } as any);

      // Batch 1 has an uncalled lead remaining in PENDING
      const pendingLeadId = "lead-uncalled-pending";
      leadStore.set(pendingLeadId, {
        id: pendingLeadId,
        status: "PENDING",
        batchId: batch1Id,
      });

      // Current call finishes
      leadStore.set(leadId, { id: leadId, status: "CALLING", batchId: batch1Id });

      const payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-expired-camp-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(payload);

      // Batch must be STOPPED because it has uncalled leads on an expired campaign
      expect(batchStore.get(batch1Id)?.status).toBe("STOPPED");
      // Pending lead must have been marked STOPPED
      expect(leadStore.get(pendingLeadId)?.status).toBe("STOPPED");
      // Campaign remains COMPLETED
      expect(campaignStore.get(campaignId)?.status).toBe("COMPLETED");
    });

    it("does not overwrite CANCELLED campaign status when late webhook arrives", async () => {
      // Campaign was cancelled
      campaignStore.set(campaignId, {
        id: campaignId,
        status: "CANCELLED",
      });

      // Last call finishes
      leadStore.set(leadId, { id: leadId, status: "CALLING", batchId: batch1Id });

      const payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-cancelled-camp-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(payload);

      // Campaign must NOT be overwritten with COMPLETED
      expect(campaignStore.get(campaignId)?.status).toBe("CANCELLED");
    });

    it("in-flight call completes on a previously STOPPED batch without flipping the batch to COMPLETED", async () => {
      // Campaign has expired and is COMPLETED
      campaignStore.set(campaignId, {
        id: campaignId,
        status: "COMPLETED",
        endTimestamp: new Date(Date.now() - 3600000),
      } as any);

      // Batch is already STOPPED with completedAt set
      batchStore.set(batch1Id, {
        id: batch1Id,
        status: "STOPPED",
        retryConfig: null,
        campaignId,
        completedAt: new Date(Date.now() - 1800000),
      });

      // Lead 2 was previously stopped uncalled
      const stoppedLeadId = "lead-stopped-uncalled";
      leadStore.set(stoppedLeadId, {
        id: stoppedLeadId,
        status: "STOPPED",
        batchId: batch1Id,
      });

      // Lead 1 is the last in-flight call completing
      leadStore.set(leadId, { id: leadId, status: "CALLING", batchId: batch1Id });

      const payload: SarvamWebhookAttemptPayload = {
        app_id: "agent-sarvam-app-1",
        app_version: 1,
        attempt_id: "att-inflight-last-001",
        campaign_id: sarvamCampaignId,
        cohort_id: sarvamCohort1Id,
        completion_status: "completed",
        connectivity_status: "connected",
        retry_attempt: 0,
        next_action_status: null,
        user_identifier: userPhoneNumber,
        user_phone_number: userPhoneNumber,
        metadata: { secret: testSecret },
      };

      await useCase.execute(payload);

      // Batch status must REMAIN STOPPED, NOT flipped to COMPLETED!
      expect(batchStore.get(batch1Id)?.status).toBe("STOPPED");
      // Campaign must REMAIN COMPLETED
      expect(campaignStore.get(campaignId)?.status).toBe("COMPLETED");
    });
  });
});

