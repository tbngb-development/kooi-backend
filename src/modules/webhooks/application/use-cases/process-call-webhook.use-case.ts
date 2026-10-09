import {
  type WebhookRepository,
  type ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import { type WebhookCallPayload } from "../dto/webhook.dto";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import type { DebitWalletForCallUseCase } from "../../../wallet/application/use-cases/debit-wallet.use-case";
import { type StopBatchesOnInsufficientBalanceUseCase } from "../../../wallet/application/use-cases/stop-batches-on-insufficient-balance.use-case";
import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import type { Queue } from "bull";
import type { CallStatus } from "@prisma/client";
import { evaluateCampaignStatusFromBatches } from "../../../campaigns/domain/rules/campaign-lifecycle.rules";

const TERMINAL_CALL_STATUSES = new Set<CallStatus>([
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "STOPPED",
]);

function mapPayloadStateToCallStatus(state: string): CallStatus | null {
  switch (state) {
    case "completed":
    case "ended":
    case "call-completed":
      return "COMPLETED";
    case "no-answer":
      return "NO_ANSWER";
    case "busy":
      return "BUSY";
    case "failed":
    case "error":
    case "balance-low":
      return "FAILED";
    case "stopped":
    case "canceled":
      return "STOPPED";
    default:
      return null;
  }
}

interface DynamicExtractionEntry {
  localDispositionId: string | null;
  localDispositionDisplayName: string | null;
  localDispositionSlug: string | null;
  subjective: string | null;
  objective: string | null;
  isObjective: boolean;
  isSubjective: boolean;
  confidence: number | null;
  confidenceLabel: string | null;
  reasoning: {
    subjective: string | null;
    objective: string | null;
  };
  validation: string | null;
}

type DynamicExtractionMap = Record<
  string,
  Record<string, DynamicExtractionEntry>
>;

export class ProcessCallWebhookUseCase {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly debitWalletForCall?: DebitWalletForCallUseCase,
    private readonly stopBatchesOnInsufficientBalance?: StopBatchesOnInsufficientBalanceUseCase,
    private readonly classifierQueue?: Queue,
    private readonly logger?: Logger,
  ) {}

  async execute(payload: WebhookCallPayload): Promise<void> {
    const callId = payload.id ?? payload.execution_id ?? payload.run_id;
    if (!callId) {
      throw new WebhookResolutionError("Missing execution / call ID.");
    }

    const state = payload.status.toLowerCase().replace("_", "-");

    // ── Idempotency & Out-of-Order Guard ──────────────────────────────────────
    const existingCall = await this.webhookRepo.findCallByBolnaCallId(callId);
    if (existingCall && TERMINAL_CALL_STATUSES.has(existingCall.status)) {
      const retryCount =
        payload.retry_count ?? payload.batch_run_details?.retried ?? 0;
      const recordedAttempts =
        (existingCall.callHistory as CallHistoryItem[])?.length ?? 0;

      // Only evaluate terminal idempotency if this is NOT a new retry attempt
      if (retryCount <= recordedAttempts) {
        const incomingTerminalStatus = mapPayloadStateToCallStatus(state);

        // Case 1: Intermediate event arriving after terminal settlement (late delivery)
        if (!incomingTerminalStatus) {
          this.logger?.debug(
            "Late intermediate webhook dropped for terminal call",
            {
              action: "webhook.call.late_intermediate_dropped",
              callId,
              currentStatus: existingCall.status,
              incomingState: state,
            },
          );
          return;
        }

        // Case 2: Conflicting terminal state arriving after settlement
        if (incomingTerminalStatus !== existingCall.status) {
          this.logger?.warn(
            "Conflicting terminal webhook dropped for call",
            {
              action: "webhook.call.conflicting_terminal_dropped",
              callId,
              currentStatus: existingCall.status,
              incomingTerminalStatus,
            },
          );
          return;
        }

        // Case 3: Same terminal state -> ALLOW execution to proceed for idempotent field updates
      }
    }

    switch (state) {
      case "queued":
      case "scheduled":
      case "rescheduled":
        break;

      case "initiated":
      case "ringing":
      case "in-progress":
      case "answered": {
        const resolved = await this.resolveCallRecord(callId, payload);
        if (!resolved) break;

        await this.webhookRepo.updateCallStatusAndHistory(
          resolved.id,
          resolved.bolnaCallId ?? callId,
          "CALLING",
          resolved.callHistory,
        );
        if (resolved.batchId) {
          await this.webhookRepo.updateBatchStatus(
            resolved.batchId,
            "RUNNING",
            new Date(),
          );
        }
        await this.webhookRepo.updateCampaignStatus(
          resolved.campaignId,
          "RUNNING",
          new Date(),
        );

        if (this.stopBatchesOnInsufficientBalance) {
          this.stopBatchesOnInsufficientBalance
            .execute({ tenantId: resolved.tenantId })
            .catch((err) =>
              this.logger?.error(
                "Credit limit check failed during call webhook",
                err,
                {
                  action: "webhook.call.credit_check",
                  tenantId: resolved.tenantId,
                  callId: resolved.id,
                },
              ),
            );
        }
        break;
      }

      case "completed":
      case "ended":
      case "call-completed": {
        const resolved = await this.resolveCallRecord(callId, payload);
        if (!resolved) break;

        await this.handleCallCompleted(resolved, payload, callId);
        break;
      }

      case "no-answer": {
        const resolved = await this.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.handleCallTerminal(resolved, "NO_ANSWER");
        break;
      }

      case "busy": {
        const resolved = await this.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.handleCallTerminal(resolved, "BUSY");
        break;
      }

      case "failed":
      case "error":
      case "balance-low": {
        const resolved = await this.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.handleCallTerminal(resolved, "FAILED");
        break;
      }

      case "stopped":
      case "canceled": {
        const resolved = await this.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.handleCallCanceled(resolved);
        break;
      }
    }
  }

  // ── Resolution Logic ─────────────────────────────────────────────────────

  private async resolveCallRecord(
    bolnaCallId: string,
    payload: WebhookCallPayload,
  ): Promise<ResolvedCallContext | null> {
    const call = await this.webhookRepo.findCallByBolnaCallId(bolnaCallId);
    const retryCount =
      payload.retry_count ?? payload.batch_run_details?.retried ?? 0;

    if (call) {
      const currentHistory = (call.callHistory as CallHistoryItem[]) ?? [];

      // If Bolna indicates a new retry attempt beyond what is currently archived in history
      if (retryCount > currentHistory.length) {
        const bolnaRetryEntry = payload.retry_history?.find(
          (h) => h.attempt === currentHistory.length,
        );

        const historyItem: CallHistoryItem = {
          attempt: currentHistory.length,
          bolnaCallId: call.bolnaCallId ?? bolnaCallId,
          status: call.status,
          duration: bolnaRetryEntry?.duration ?? call.duration,
          cost: call.cost,
          timestamp: call.updatedAt.toISOString(),
          errorMessage:
            bolnaRetryEntry?.error_message ?? payload.error_message ?? null,
          hangupReason:
            bolnaRetryEntry?.hangup_reason ??
            payload.telephony_data?.hangup_reason ??
            null,
        };

        const updatedHistory = [...currentHistory, historyItem];

        return this.webhookRepo.updateCallStatusAndHistory(
          call.id,
          call.bolnaCallId ?? bolnaCallId,
          "CALLING",
          updatedHistory,
        );
      }

      return call;
    }

    const bolnaBatchId = payload.batch_id;
    const phone =
      payload.telephony_data?.to_number ??
      payload.context_details?.recipient_phone_number;

    if (!bolnaBatchId || !phone) return null;

    const batch =
      await this.webhookRepo.findBatchIdByBolnaBatchId(bolnaBatchId);
    if (!batch) return null;

    const lead =
      (await this.webhookRepo.findLeadByPhoneAndBatch(phone, batch.id)) ??
      (await this.webhookRepo.findLeadByPhoneAndCampaign(
        phone,
        batch.campaignId,
      ));

    if (!lead) return null;

    const existingCall = await this.webhookRepo.findCallByLeadAndBatch(
      lead.id,
      batch.id,
    );

    if (existingCall) {
      const history = (existingCall.callHistory as CallHistoryItem[]) ?? [];

      if (retryCount > history.length) {
        const historyItem: CallHistoryItem = {
          attempt: history.length,
          bolnaCallId: existingCall.bolnaCallId ?? bolnaCallId,
          status: existingCall.status,
          duration: existingCall.duration,
          cost: existingCall.cost,
          timestamp: existingCall.updatedAt.toISOString(),
          errorMessage: payload.error_message ?? null,
          hangupReason: payload.telephony_data?.hangup_reason ?? null,
        };

        const updatedHistory = [...history, historyItem];

        return this.webhookRepo.updateCallStatusAndHistory(
          existingCall.id,
          existingCall.bolnaCallId ?? bolnaCallId,
          "CALLING",
          updatedHistory,
        );
      }

      return existingCall;
    }

    const newCall = await this.webhookRepo.createCall({
      bolnaCallId,
      tenantId: batch.tenantId,
      campaignId: batch.campaignId,
      leadId: lead.id,
      batchId: batch.id,
      status: "CALLING",
      startedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(lead.id, "CALLING");

    return newCall;
  }

  // ── Terminal Handlers ────────────────────────────────────────────────────

  private async handleCallCompleted(
    call: ResolvedCallContext,
    payload: WebhookCallPayload,
    bolnaCallId: string,
  ): Promise<void> {
    const messages = (payload.messages ?? []).map((m) => ({
      role: m.role === "agent" ? "assistant" : "user",
      message: m.content,
      time: m.created_at ?? null,
    }));

    const transcript =
      payload.transcript ||
      messages.map((m) => `${m.role}: ${m.message}`).join("\n") ||
      null;
    const duration =
      typeof payload.telephony_data?.duration === "string"
        ? parseInt(payload.telephony_data.duration, 10)
        : (payload.telephony_data?.duration ??
          payload.conversation_duration ??
          payload.duration ??
          null);

    try {
      const dynamicResult = await this.mapCallExtractions(
        call.id,
        call.tenantId,
        payload.extracted_data as Record<string, unknown> | null | undefined,
      );

      if (dynamicResult) {
        await this.materializeExtractionOverview(
          call.id,
          call.tenantId,
          dynamicResult,
        );

        await this.materializeExtractionInsights(
          call.id,
          call.tenantId,
          dynamicResult,
        );
      }
    } catch (err) {
      this.logger?.error("Dynamic extraction mapping failed", err, {
        action: "webhook.call.extraction_failed",
        callId: call.id,
        tenantId: call.tenantId,
      });
    }

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "COMPLETED",
      transcript,
      transcriptMessages: messages.length > 0 ? messages : null,
      duration,
      recording:
        payload.telephony_data?.recording_url ?? payload.recording_url ?? null,
      cost: payload.total_cost ?? null,
      extracted_data: payload.extracted_data,
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, "CALLED");

    if (call.status !== "COMPLETED") {
      await this.webhookRepo.incrementTerminalStats(
        call.campaignId,
        call.batchId,
        "COMPLETED",
      );
    }

    if (
      call.status !== "COMPLETED" &&
      this.debitWalletForCall &&
      duration &&
      duration > 0
    ) {
      try {
        const debitResult = await this.debitWalletForCall.execute({
          tenantId: call.tenantId,
          callId: call.id,
          bolnaCallId: String(bolnaCallId),
          durationSec: duration,
        });

        if (debitResult) {
          await this.webhookRepo.updateCallCostBreakdown(call.id, {
            platformCost: debitResult.amountPaisa,
            billableSeconds: debitResult.billableSeconds,
            planVersionId: debitResult.planVersionId,
            appliedRate: debitResult.appliedRate,
            appliedMinSec: debitResult.appliedMinSec,
            appliedIncrementSec: debitResult.appliedIncrementSec,
            chargedAmount: debitResult.amountPaisa,
          });
        }
      } catch (err) {
        this.logger?.error("Wallet debit failed during call webhook", err, {
          action: "webhook.call.debit_failed",
          callId: call.id,
          tenantId: call.tenantId,
          bolnaCallId: String(bolnaCallId),
          durationSec: duration,
        });
      }
    }

    // ── Classifier Extraction (async, non-blocking) ──────────────
    if (
      call.status !== "COMPLETED" &&
      this.classifierQueue &&
      transcript
    ) {
      this.classifierQueue
        .add(
          { callId: call.id, tenantId: call.tenantId },
          { jobId: `classifier-${call.id}` },
        )
        .catch((err) =>
          this.logger?.warn("Classifier enqueue failed", {
            action: "webhook.call.classifier_enqueue_failed",
            callId: call.id,
            error: err?.message,
          }),
        );
    }

    this.logger?.info("Call completed", {
      action: "webhook.call.completed",
      callId: call.id,
      tenantId: call.tenantId,
      campaignId: call.campaignId,
      batchId: call.batchId ? call.batchId : undefined,
      bolnaCallId: String(bolnaCallId),
      durationSec: duration,
    });

    await this.checkBatchCompletion(call);
  }

  private async handleCallTerminal(
    call: ResolvedCallContext,
    status: "NO_ANSWER" | "BUSY" | "FAILED",
  ): Promise<void> {
    await this.webhookRepo.updateCallTerminalState(call.id, {
      status,
      endedAt: new Date(),
    });

    const leadStatus = status === "FAILED" ? "FAILED" : "NO_ANSWER";
    await this.webhookRepo.updateLeadStatus(call.leadId, leadStatus);

    if (call.status !== status) {
      await this.webhookRepo.incrementTerminalStats(
        call.campaignId,
        call.batchId,
        status,
      );
    }

    this.logger?.debug("Call terminal", {
      action: "webhook.call.terminal",
      callId: call.id,
      tenantId: call.tenantId,
      status,
    });

    await this.checkBatchCompletion(call);
  }

  private async handleCallCanceled(call: ResolvedCallContext): Promise<void> {
    if (call.status === "STOPPED") return;

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "STOPPED",
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, "STOPPED");

    this.logger?.debug("Call canceled", {
      action: "webhook.call.canceled",
      callId: call.id,
      tenantId: call.tenantId,
    });

    await this.checkBatchCompletion(call);
  }

  private async mapCallExtractions(
    callId: string,
    tenantId: string,
    extractedData: Record<string, unknown> | null | undefined,
  ): Promise<DynamicExtractionMap | null> {
    if (!extractedData || Object.keys(extractedData).length === 0) return null;

    const agentMap = await this.webhookRepo.getAgentDispositionsForCall(callId);

    if (!agentMap.platformAgentId || agentMap.dispositions.length === 0) {
      await prisma.callAnalysis.upsert({
        where: { callId },
        create: {
          callId,
          tenantId,
          extractionResult: extractedData as unknown as InputJsonValue,
        },
        update: {
          extractionResult: extractedData as unknown as InputJsonValue,
        },
      });
      return null;
    }

    const dispositionLookup = new Map<
      string,
      {
        id: string;
        slug: string;
        displayName: string;
        isObjective: boolean;
        isSubjective: boolean;
      }
    >();
    for (const disp of agentMap.dispositions) {
      const entry = {
        id: disp.id,
        slug: disp.slug,
        displayName: disp.displayName,
        isObjective: disp.isObjective,
        isSubjective: disp.isSubjective,
      };
      dispositionLookup.set(disp.name.toLowerCase(), entry);
      dispositionLookup.set(disp.slug.toLowerCase(), entry);
    }

    const dynamicResult: DynamicExtractionMap = {};
    let primaryDispositionId: string | null = null;

    for (const [categoryName, dispositions] of Object.entries(extractedData)) {
      if (typeof dispositions !== "object" || dispositions === null) continue;

      const categoryResult: Record<string, DynamicExtractionEntry> = {};

      for (const [dispName, value] of Object.entries(
        dispositions as Record<string, Record<string, unknown>>,
      )) {
        if (typeof value !== "object" || value === null) continue;

        const localDisp =
          dispositionLookup.get(dispName.toLowerCase()) ??
          dispositionLookup.get(dispName);

        const entry: DynamicExtractionEntry = {
          localDispositionId: localDisp?.id ?? null,
          localDispositionSlug: localDisp?.slug ?? null,
          localDispositionDisplayName: localDisp?.displayName ?? null,
          subjective: (value.subjective as string) ?? null,
          objective: (value.objective as string) ?? null,
          isObjective: localDisp?.isObjective ?? false,
          isSubjective: localDisp?.isSubjective ?? false,
          confidence: (value.confidence as number) ?? null,
          confidenceLabel: (value.confidence_label as string) ?? null,
          reasoning: {
            subjective: (value.reasoning_subjective as string) ?? null,
            objective: (value.reasoning_objective as string) ?? null,
          },
          validation: (value.validation as string) ?? null,
        };

        categoryResult[dispName] = entry;

        if (!primaryDispositionId && localDisp && value.objective != null) {
          const slugLower = localDisp.slug.toLowerCase();
          if (
            slugLower.includes("disposition") ||
            slugLower.includes("outcome")
          ) {
            primaryDispositionId = localDisp.id;
          }
        }
      }

      dynamicResult[categoryName] = categoryResult;
    }

    if (!primaryDispositionId) {
      for (const dispositions of Object.values(dynamicResult)) {
        for (const result of Object.values(dispositions)) {
          if (result.localDispositionId && result.objective != null) {
            primaryDispositionId = result.localDispositionId;
            break;
          }
        }
        if (primaryDispositionId) break;
      }
    }

    await prisma.callAnalysis.upsert({
      where: { callId },
      create: {
        callId,
        tenantId,
        extractionResult: extractedData as InputJsonValue,
        dynamicExtractions: dynamicResult as unknown as InputJsonValue,
      },
      update: {
        extractionResult: extractedData as InputJsonValue,
        dynamicExtractions: dynamicResult as unknown as InputJsonValue,
      },
    });

    return dynamicResult;
  }

  private async materializeExtractionOverview(
    callId: string,
    tenantId: string,
    dynamicResult: DynamicExtractionMap,
  ): Promise<void> {
    const objectiveEntries: Array<{
      dispositionId: string;
      dispositionSlug: string;
      categoryName: string;
      objectiveValue: string;
      confidence: number | null;
    }> = [];

    for (const [categoryName, dispositions] of Object.entries(dynamicResult)) {
      for (const [_dispName, entry] of Object.entries(dispositions)) {
        if (
          entry.isObjective &&
          entry.localDispositionId &&
          entry.localDispositionSlug &&
          entry.objective !== null &&
          entry.objective.trim() !== "" &&
          entry.objective !== "NO_DATA" &&
          entry.confidence &&
          entry.confidence > 0.5
        ) {
          objectiveEntries.push({
            dispositionId: entry.localDispositionId,
            dispositionSlug: entry.localDispositionSlug,
            categoryName,
            objectiveValue: entry.objective.trim(),
            confidence: entry.confidence,
          });
        }
      }
    }

    if (objectiveEntries.length === 0) return;

    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { campaignId: true, batchId: true },
    });

    if (!call) return;

    const dispositionIds = [
      ...new Set(objectiveEntries.map((e) => e.dispositionId)),
    ];

    const dispositions = await prisma.extractionDisposition.findMany({
      where: { id: { in: dispositionIds } },
      select: { id: true, displayName: true },
    });
    const nameMap = new Map(dispositions.map((d) => [d.id, d.displayName]));

    await prisma.callExtractionOverview.deleteMany({ where: { callId } });

    await prisma.callExtractionOverview.createMany({
      data: objectiveEntries.map((e) => ({
        callId,
        tenantId,
        campaignId: call.campaignId,
        batchId: call.batchId,
        dispositionId: e.dispositionId,
        dispositionSlug: e.dispositionSlug,
        dispositionName: nameMap.get(e.dispositionId) ?? e.dispositionSlug,
        categoryName: e.categoryName,
        objectiveValue: e.objectiveValue,
        confidence: e.confidence,
      })),
    });

    this.logger?.debug("Extraction overview materialized", {
      action: "webhook.call.overview_materialized",
      callId,
      tenantId,
      rowCount: objectiveEntries.length,
    });
  }

  private async materializeExtractionInsights(
    callId: string,
    tenantId: string,
    dynamicResult: DynamicExtractionMap,
  ): Promise<void> {
    const subjectiveEntries: Array<{
      dispositionId: string;
      dispositionSlug: string;
      categoryName: string;
      subjectiveValue: string;
      normalizedValue: string;
      confidence: number | null;
    }> = [];

    const seenDispositions = new Set<string>();

    for (const [categoryName, dispositions] of Object.entries(dynamicResult)) {
      for (const [_dispName, entry] of Object.entries(dispositions)) {
        if (
          entry.isSubjective &&
          entry.localDispositionId &&
          entry.localDispositionSlug &&
          entry.subjective !== null &&
          entry.subjective.trim() !== "" &&
          entry.subjective !== "NO_DATA" &&
          entry.confidence &&
          entry.confidence > 0.5
        ) {
          if (seenDispositions.has(entry.localDispositionId)) continue;
          seenDispositions.add(entry.localDispositionId);

          const raw = entry.subjective.trim();

          subjectiveEntries.push({
            dispositionId: entry.localDispositionId,
            dispositionSlug: entry.localDispositionSlug,
            categoryName: categoryName.trim().replace(/\s+/g, " "),
            subjectiveValue: raw,
            normalizedValue: raw.toLowerCase().replace(/\s+/g, " "),
            confidence: entry.confidence,
          });
        }
      }
    }

    if (subjectiveEntries.length === 0) return;

    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { campaignId: true, batchId: true },
    });

    if (!call) return;

    const dispositionIds = Array.from(seenDispositions);

    const dispositions = await prisma.extractionDisposition.findMany({
      where: { id: { in: dispositionIds } },
      select: { id: true, displayName: true },
    });
    const nameMap = new Map(dispositions.map((d) => [d.id, d.displayName]));

    await prisma.callExtractionInsight.deleteMany({ where: { callId } });

    await prisma.callExtractionInsight.createMany({
      data: subjectiveEntries.map((e) => ({
        callId,
        tenantId,
        campaignId: call.campaignId,
        batchId: call.batchId,
        dispositionId: e.dispositionId,
        dispositionSlug: e.dispositionSlug,
        dispositionName: nameMap.get(e.dispositionId) ?? e.dispositionSlug,
        categoryName: e.categoryName,
        subjectiveValue: e.subjectiveValue,
        normalizedValue: e.normalizedValue,
        confidence: e.confidence,
      })),
    });

    this.logger?.debug("Extraction insights materialized", {
      action: "webhook.call.insights_materialized",
      callId,
      tenantId,
      rowCount: subjectiveEntries.length,
    });
  }

  // ── Completion Checks ────────────────────────────────────────────────────

  private async checkBatchCompletion(call: ResolvedCallContext): Promise<void> {
    if (call.batchId) {
      const activeLeads = await this.webhookRepo.countActiveLeadsInBatch(
        call.batchId,
      );
      if (activeLeads === 0) {
        await this.webhookRepo.updateBatchStatus(
          call.batchId,
          "COMPLETED",
          new Date(),
        );
      }
    }

    const statuses = await this.webhookRepo.getAllBatchStatuses(
      call.campaignId,
    );

    if (statuses.length > 0) {
      const targetStatus = evaluateCampaignStatusFromBatches(statuses);

      if (targetStatus && targetStatus !== "RUNNING") {
        await this.webhookRepo.updateCampaignStatus(
          call.campaignId,
          targetStatus,
          new Date(),
        );

        this.logger?.info("Campaign marked as finished from call webhook", {
          action: "webhook.call.campaign_completed",
          campaignId: call.campaignId,
          finalCampaignStatus: targetStatus,
        });
      }
    } else {
      const legacyActive =
        await this.webhookRepo.countActiveLeadsInCampaignLegacy(
          call.campaignId,
        );
      if (legacyActive === 0) {
        await this.webhookRepo.updateCampaignStatus(
          call.campaignId,
          "COMPLETED",
          new Date(),
        );
      }
    }
  }
}
