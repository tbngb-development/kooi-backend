import type { CallStatus, LeadStatus } from "@prisma/client";
import type { Queue } from "bull";
import { AppError } from "../../../../shared/errors/app.error";
import { UnauthorizedError } from "../../../../shared/errors/unauthorized.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import {
  HEADER_WEBHOOK_SECRET,
  WebhookMessages,
} from "../../../../shared/constants";
import { env } from "../../../../shared/config/env";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { SarvamWebhookAttemptPayload } from "../dto/sarvam-webhook.dto";
import { isValidSarvamWebhookPayload } from "../dto/sarvam-webhook.dto";
import type { SarvamLeadCorrelationService } from "../services/sarvam-lead-correlation.service";
import type {
  ISarvamWebhookRepository,
  SarvamAttemptHistoryEntry,
} from "../interfaces/sarvam-webhook-repository.interface";
import { getQueue } from "../../../../shared/config/external/queue/queue.factory";

export interface ProcessSarvamWebhookResult {
  status: "SUCCESS" | "IDEMPOTENT_IGNORED" | "CORRELATION_REJECTED";
  callId?: string;
  attemptId: string;
  reason?: string;
  code?: string;
}

export class ProcessSarvamWebhookUseCase {
  private readonly expectedSecret: string;

  constructor(
    private readonly correlationService: SarvamLeadCorrelationService,
    private readonly webhookRepo: ISarvamWebhookRepository,
    private readonly logger?: Logger,
    expectedSecret?: string,
    private readonly recordingQueue?: Queue,
  ) {
    this.expectedSecret = expectedSecret ?? env.sarvam.webhookSecret;
  }

  /**
   * Processes an incoming Sarvam call attempt event:
   * 1. Authenticates webhook (dual verification via metadata secret + optional header).
   * 2. Correlates Campaign, Batch, Lead via Phase 3 correlation layer.
   * 3. Uses PostgreSQL transaction advisory lock to guarantee concurrency safety.
   * 4. Enforces attempt-level idempotency via attempt_id in callHistory.
   * 5. Maintains one aggregate Call per Lead per Campaign, updating fields and history.
   * 6. Updates Lead status according to retryable vs terminal attempt.
   */
  async execute(
    payload: unknown,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<ProcessSarvamWebhookResult> {
    this.logger?.debug("sarvam webhook payload: ", {
      payload: payload,
    });
    // 1. Payload structural validation
    if (!isValidSarvamWebhookPayload(payload)) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Malformed Sarvam webhook payload",
        "MALFORMED_WEBHOOK_PAYLOAD",
      );
    }

    const p = payload as SarvamWebhookAttemptPayload;

    // 2. Dual webhook verification
    this.verifyWebhookAuth(p, headers);

    // 3. Correlate with existing Kooi entities
    const correlation = await this.correlationService.correlate({
      sarvamCampaignId: p.campaign_id,
      sarvamCohortId: p.cohort_id,
      userPhoneNumber: p.user_phone_number,
      userIdentifier: p.user_identifier,
    });

    if (!correlation.success) {
      this.logger?.warn("Sarvam webhook correlation rejected", {
        action: "webhook.sarvam.correlation_rejected",
        attemptId: p.attempt_id,
        failure: correlation.failure,
      });

      return {
        status: "CORRELATION_REJECTED",
        attemptId: p.attempt_id,
        reason: correlation.failure.message,
        code: correlation.failure.code,
      };
    }

    const { tenantId, campaign, batch, lead } = correlation.data;

    // 4. Concurrency lock serialized on (leadId, campaignId)
    const lockKey = `sarvam-call:${lead.id}:${campaign.id}`;

    return await this.webhookRepo.executeInAdvisoryLock(
      lockKey,
      async (txRepo) => {
        const existingCall = await txRepo.findAggregateCall(
          lead.id,
          campaign.id,
        );

        // 5. Idempotency check: attempt_id already in history
        const existingHistory =
          (existingCall?.callHistory as SarvamAttemptHistoryEntry[]) || [];

        const isDuplicate = existingHistory.some(
          (entry) => entry.attempt_id === p.attempt_id,
        );

        if (isDuplicate) {
          this.logger?.info("Sarvam attempt ignored idempotently", {
            action: "webhook.sarvam.idempotent_duplicate",
            attemptId: p.attempt_id,
            callId: existingCall?.id,
          });

          return {
            status: "IDEMPOTENT_IGNORED",
            attemptId: p.attempt_id,
            callId: existingCall?.id,
          };
        }

        // 6. Format attempt history entry
        const turns = p.interaction_transcript ?? [];
        const formattedTranscript =
          turns.length > 0
            ? turns
                .map(
                  (t) =>
                    `${t.role === "agent" ? "Agent" : "User"}: ${t.en_text || t.text || ""}`,
                )
                .join("\n")
            : null;

        const startedAt = p.start_datetime ? new Date(p.start_datetime) : null;
        const endedAt = p.end_datetime ? new Date(p.end_datetime) : null;
        const executedAt = p.executed_at ?? new Date().toISOString();

        const attemptDisposition = this.mapAttemptDisposition(p);

        const attemptEntry: SarvamAttemptHistoryEntry = {
          attempt_id: p.attempt_id,
          interaction_id: p.interaction_id ?? null,
          user_identifier: p.user_identifier,
          retry_attempt:
            typeof p.retry_attempt === "number" ? p.retry_attempt : 0,
          connectivity_status: p.connectivity_status ?? null,
          completion_status: p.completion_status,
          next_action_status: p.next_action_status ?? null,
          failure_reason: p.failure_reason ?? null,
          duration:
            typeof p.duration === "number" ? Math.round(p.duration) : null,
          executed_at: p.executed_at ?? null,
          start_datetime: p.start_datetime ?? null,
          end_datetime: p.end_datetime ?? null,
          timestamp: executedAt,
          status: attemptDisposition,
          initial_agent_variables: p.initial_agent_variables ?? null,
          final_agent_variables: p.final_agent_variables ?? null,
          output_agent_variables: p.output_agent_variables ?? null,
          transcript: formattedTranscript,
          metadata: p.metadata ?? null,
        };

        // 7. Determine aggregate Call status and Lead status
        const aggregateCallStatus = this.mapAggregateCallStatus(p);
        const targetLeadStatus = this.mapLeadStatus(p);

        let finalCallId = existingCall?.id;

        if (existingCall) {
          const updatedHistory = [...existingHistory, attemptEntry];

          await txRepo.updateAggregateCall(existingCall.id, {
            status: aggregateCallStatus,
            sarvamAttemptId: p.attempt_id,
            sarvamInteractionId:
              p.interaction_id ?? existingCall.sarvamInteractionId,
            sarvamUserIdentifier: p.user_identifier,
            callHistory: updatedHistory,
            agentNumber: p.agent_phone_number ?? existingCall.agentNumber,
            duration:
              typeof p.duration === "number"
                ? Math.round(p.duration)
                : existingCall.duration,
            startedAt: startedAt ?? existingCall.startedAt,
            endedAt: endedAt ?? existingCall.endedAt,
            transcript: formattedTranscript ?? existingCall.transcript,
            transcriptMessages:
              p.interaction_transcript ?? existingCall.transcriptMessages,
            extractionResult:
              p.output_agent_variables ??
              p.final_agent_variables ??
              existingCall.extractionResult,
          });
        } else {
          const newCall = await txRepo.createAggregateCall({
            tenantId,
            campaignId: campaign.id,
            batchId: batch.id,
            leadId: lead.id,
            sarvamAgentId: campaign.sarvamAgentId,
            provider: "SARVAM",
            status: aggregateCallStatus,
            sarvamAttemptId: p.attempt_id,
            sarvamInteractionId: p.interaction_id ?? null,
            sarvamUserIdentifier: p.user_identifier,
            callHistory: [attemptEntry],
            agentNumber: p.agent_phone_number ?? null,
            duration:
              typeof p.duration === "number" ? Math.round(p.duration) : null,
            startedAt,
            endedAt,
            transcript: formattedTranscript,
            transcriptMessages: p.interaction_transcript ?? null,
            extractionResult:
              p.output_agent_variables ?? p.final_agent_variables ?? null,
          });

          finalCallId = newCall.id;
        }

        // 8. Resolve Sarvam Agent and match output variables dynamically
        let matchedOutputVariables: Array<{ key: string; value: unknown }> = [];

        if (campaign.sarvamAgentId) {
          const agentConfig = await txRepo.findSarvamAgentForTenant(
            campaign.sarvamAgentId,
            tenantId,
          );

          if (!agentConfig) {
            this.logger?.warn("Sarvam agent configuration not found or tenant unauthorized", {
              action: "webhook.sarvam.agent_not_found",
              sarvamAgentId: campaign.sarvamAgentId,
              tenantId,
            });
          } else {
            matchedOutputVariables = this.extractMatchedOutputVariables(
              agentConfig.outputVariables,
              p.output_agent_variables,
            );

            this.logger?.info("Sarvam output variables evaluated", {
              action: "webhook.sarvam.output_variables_evaluated",
              configuredCount: Array.isArray(agentConfig.outputVariables)
                ? agentConfig.outputVariables.length
                : 0,
              matchedCount: matchedOutputVariables.length,
            });
          }
        } else {
          this.logger?.info("Campaign has no sarvamAgentId, skipping output variable extraction", {
            action: "webhook.sarvam.no_agent_id",
            campaignId: campaign.id,
          });
        }

        // 9. Persist matching output variables in CallAnalysis
        if (matchedOutputVariables.length > 0) {
          await txRepo.upsertCallAnalysisOutputVariables(
            finalCallId!,
            tenantId,
            matchedOutputVariables,
          );

          this.logger?.info("CallAnalysis output variables persisted successfully", {
            action: "webhook.sarvam.call_analysis_persisted",
            callId: finalCallId,
            matchedCount: matchedOutputVariables.length,
          });
        }

        // 10. Update Lead status
        await txRepo.updateLeadStatus(lead.id, targetLeadStatus);

        // 11. Trigger automatic recording retrieval if completed + connected with interaction_id
        const isCompleted = p.completion_status?.toLowerCase() === "completed";
        const isConnected =
          p.connectivity_status?.toLowerCase() === "connected";
        const hasInteractionId = Boolean(p.interaction_id);

        if (isCompleted && isConnected && hasInteractionId && finalCallId) {
          try {
            const queue =
              this.recordingQueue ?? getQueue("sarvam-recording-retrieval");
            await queue.add(
              "fetch-recording",
              {
                callId: finalCallId,
                tenantId,
                attemptId: p.attempt_id,
                interactionId: p.interaction_id!,
                source: "AUTOMATIC",
              },
              {
                jobId: `sarvam-recording:${p.interaction_id}`,
                attempts: 5,
                backoff: {
                  type: "sarvamBackoff",
                },
                removeOnComplete: 100,
                removeOnFail: 500,
              },
            );

            this.logger?.info(
              "Enqueued automatic Sarvam recording retrieval job",
              {
                action: "webhook.sarvam.recording_enqueued",
                callId: finalCallId,
                attemptId: p.attempt_id,
                interactionId: p.interaction_id,
              },
            );
          } catch (queueErr) {
            this.logger?.error(
              "Failed to enqueue Sarvam recording retrieval job",
              queueErr,
              {
                action: "webhook.sarvam.recording_queue_error",
                callId: finalCallId,
                interactionId: p.interaction_id,
              },
            );
          }
        }

        this.logger?.info("Sarvam call attempt processed successfully", {
          action: "webhook.sarvam.success",
          callId: finalCallId,
          attemptId: p.attempt_id,
          callStatus: aggregateCallStatus,
          leadStatus: targetLeadStatus,
        });

        return {
          status: "SUCCESS",
          callId: finalCallId,
          attemptId: p.attempt_id,
        };
      },
    );
  }

  private verifyWebhookAuth(
    payload: SarvamWebhookAttemptPayload,
    headers?: Record<string, string | string[] | undefined>,
  ): void {
    if (!this.expectedSecret) return;

    const payloadSecret = payload.metadata?.secret as string | undefined;

    let headerSecret: string | undefined;
    if (headers) {
      const rawHeader =
        headers[HEADER_WEBHOOK_SECRET] ??
        headers["x-webhook-secret"] ??
        headers["X-Webhook-Secret"];
      headerSecret = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    }

    const matchesPayload = payloadSecret === this.expectedSecret;
    const matchesHeader = headerSecret === this.expectedSecret;

    if (!matchesPayload && !matchesHeader) {
      this.logger?.warn("Sarvam webhook authentication failed", {
        action: "webhook.sarvam.unauthorized",
        hasPayloadSecret: Boolean(payloadSecret),
        hasHeaderSecret: Boolean(headerSecret),
      });

      throw new UnauthorizedError(WebhookMessages.INVALID_SECRET);
    }
  }

  private mapAttemptDisposition(p: SarvamWebhookAttemptPayload): string {
    const conn = (p.connectivity_status || "").toLowerCase();
    const comp = (p.completion_status || "").toLowerCase();

    if (conn === "connected") {
      return comp === "completed" ? "COMPLETED" : "PARTIAL";
    }
    if (conn === "busy") return "BUSY";
    if (conn === "no_answer") return "NO_ANSWER";
    if (conn === "failed" || comp === "failed") return "FAILED";
    return "FAILED";
  }

  private mapAggregateCallStatus(p: SarvamWebhookAttemptPayload): CallStatus {
    const conn = (p.connectivity_status || "").toLowerCase();
    const comp = (p.completion_status || "").toLowerCase();

    if (conn === "connected") {
      return "COMPLETED";
    }
    if (conn === "busy") return "BUSY";
    if (conn === "no_answer") return "NO_ANSWER";
    if (conn === "failed" || comp === "failed") return "FAILED";
    return "FAILED";
  }

  private mapLeadStatus(p: SarvamWebhookAttemptPayload): LeadStatus {
    const isRetryable =
      p.next_action_status !== null && p.next_action_status !== undefined;

    if (isRetryable) {
      return "CALLING";
    }

    const conn = (p.connectivity_status || "").toLowerCase();
    const comp = (p.completion_status || "").toLowerCase();

    if (conn === "connected") {
      return "CALLED";
    }
    if (conn === "busy") return "BUSY";
    if (conn === "no_answer") return "NO_ANSWER";
    if (conn === "failed" || comp === "failed") return "FAILED";
    return "CALLED";
  }

  private extractMatchedOutputVariables(
    configuredVariables: unknown,
    outputAgentVariables: unknown,
  ): Array<{ key: string; value: unknown }> {
    if (!configuredVariables || !Array.isArray(configuredVariables)) {
      return [];
    }

    if (
      !outputAgentVariables ||
      typeof outputAgentVariables !== "object" ||
      Array.isArray(outputAgentVariables)
    ) {
      return [];
    }

    const payloadVars = outputAgentVariables as Record<string, unknown>;
    const matched: Array<{ key: string; value: unknown }> = [];

    for (const item of configuredVariables) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as any).name !== "string"
      ) {
        continue;
      }
      const varName = (item as any).name.trim();
      if (!varName) continue;

      if (Object.prototype.hasOwnProperty.call(payloadVars, varName)) {
        const rawValue = payloadVars[varName];
        if (rawValue !== undefined) {
          if (typeof rawValue !== "function" && typeof rawValue !== "symbol") {
            matched.push({ key: varName, value: rawValue });
          } else {
            this.logger?.warn("Invalid Sarvam output variable value type ignored", {
              action: "webhook.sarvam.invalid_output_var_type",
              key: varName,
              type: typeof rawValue,
            });
          }
        }
      }
    }

    return matched;
  }
}
