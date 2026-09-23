import {
  type WebhookRepository,
  type ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import { type WebhookCallPayload } from "../dto/webhook.dto";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type {
  CallHistoryItem,
} from "../../../../shared/types/bolna.types";
import type { DebitWalletForCallUseCase } from "../../../wallet/application/use-cases/debit-wallet.use-case";
import { type StopBatchesOnInsufficientBalanceUseCase } from "../../../wallet/application/use-cases/stop-batches-on-insufficient-balance.use-case";
import prisma from "../../../../shared/config/database/prisma";
import type { InputJsonValue } from "@prisma/client/runtime/library";

interface DynamicExtractionEntry {
  localDispositionId: string | null;
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
  ) {}

  async execute(payload: WebhookCallPayload): Promise<void> {
    const callId = payload.id ?? payload.execution_id ?? payload.run_id;
    if (!callId) {
      throw new WebhookResolutionError("Missing execution / call ID.");
    }

    const state = payload.status.toLowerCase().replace("_", "-");

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
          callId,
          "CALLING",
          [],
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

        // [NEW] Check credit limit when in-flight count increases
        if (this.stopBatchesOnInsufficientBalance) {
          this.stopBatchesOnInsufficientBalance
            .execute({ tenantId: resolved.tenantId })
            .catch(console.error);
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
    if (call) return call;

    const bolnaBatchId = payload.batch_id;
    const phone =
      payload.telephony_data?.to_number ??
      payload.context_details?.recipient_phone_number;
    const retried = payload.batch_run_details?.retried ?? 0;

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

    if (existingCall && retried > 0) {
      const history = (existingCall.callHistory as CallHistoryItem[]) ?? [];
      history.push({
        attempt: retried,
        bolnaCallId: existingCall?.bolnaCallId ?? bolnaCallId,
        status: existingCall.status,
        duration: existingCall.duration,
        cost: existingCall.cost,
        timestamp: existingCall.updatedAt.toISOString(),
      });

      return this.webhookRepo.updateCallStatusAndHistory(
        existingCall.id,
        bolnaCallId,
        "CALLING",
        history,
      );
    }

    if (existingCall && retried === 0) {
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
      // Best-effort — don't fail the webhook if extraction mapping fails
      console.error("[Webhook] Dynamic extraction mapping failed:", err);
    }

    // ── Step 1: Persist terminal state (Bolna cost in `cost` field) ──
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

    await this.webhookRepo.incrementTerminalStats(
      call.campaignId,
      call.batchId,
      "COMPLETED",
    );

    // ── Step 2: Debit wallet + snapshot immutable pricing terms ──
    if (this.debitWalletForCall && duration && duration > 0) {
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
        console.error("[Webhook] wallet debit failed:", err);
      }
    }

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

    await this.webhookRepo.incrementTerminalStats(
      call.campaignId,
      call.batchId,
      status,
    );
    await this.checkBatchCompletion(call);
  }

  private async handleCallCanceled(call: ResolvedCallContext): Promise<void> {
    if (call.status === "STOPPED") return;

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "STOPPED",
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, "STOPPED");
    await this.checkBatchCompletion(call);
  }

  /**
   * Maps Bolna's extracted_data to local disposition IDs and stores
   * the result in CallAnalysis.dynamicExtractions + extractionDispositionId.
   *
   * Replaces the old GenerateDynamicExtractionsUseCase.
   */
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
          extractionResult: extractedData as InputJsonValue,
        },
        update: {
          extractionResult: extractedData as InputJsonValue,
        },
      });
      return null;
    }

    // Build lookup — all dispositions come through categories now
    const dispositionLookup = new Map<
      string,
      { id: string; slug: string; isObjective: boolean; isSubjective: boolean } // ← UPDATED
    >();
    for (const disp of agentMap.dispositions) {
      const entry = {
        id: disp.id,
        slug: disp.slug,
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
        extractionDispositionId: primaryDispositionId,
      },
      update: {
        extractionResult: extractedData as InputJsonValue,
        dynamicExtractions: dynamicResult as unknown as InputJsonValue,
        extractionDispositionId: primaryDispositionId,
      },
    });

    return dynamicResult;
  }

  /**
   * Auto-generates structured overview rows for every objective disposition
   * that returned a value. No manual ExtractionConfig needed.
   *
   * One row per (call, objective disposition) — enables GROUP BY aggregation
   * for campaign performance overview dashboards.
   *
   * Idempotent: deletes previous rows for this call before inserting
   * (handles webhook retries safely).
   */
  private async materializeExtractionOverview(
    callId: string,
    tenantId: string,
    dynamicResult: DynamicExtractionMap,
  ): Promise<void> {
    // Collect all objective entries with values
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
          entry.objective.trim() !== ""
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

    // Fetch call metadata for denormalization
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { campaignId: true, batchId: true },
    });

    if (!call) return;

    // Fetch disposition names for denormalization
    const dispositionIds = [
      ...new Set(objectiveEntries.map((e) => e.dispositionId)),
    ];
    const dispositions = await prisma.extractionDisposition.findMany({
      where: { id: { in: dispositionIds } , showInOverview: true},
      select: { id: true, name: true },
    });
    const nameMap = new Map(dispositions.map((d) => [d.id, d.name]));

    // Idempotent: remove previous overview rows for this call (webhook retries)
    await prisma.callExtractionOverview.deleteMany({ where: { callId } });

    // Bulk insert
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

    console.info(
      `[Webhook] Materialized ${objectiveEntries.length} overview rows for call ${callId}`,
    );
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
        // Only subjective dispositions with a subjective value
        if (
          entry.isSubjective &&
          entry.localDispositionId &&
          entry.localDispositionSlug &&
          entry.subjective !== null &&
          entry.subjective.trim() !== ""
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
      where: { id: { in: dispositionIds } , showInInsights: true,},
      select: { id: true, name: true },
    });
    const nameMap = new Map(dispositions.map((d) => [d.id, d.name]));

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

    console.info(
      `[Webhook] Materialized ${subjectiveEntries.length} insight rows for call ${callId}`,
    );
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
      const allTerminal = statuses.every(
        (s) => s === "COMPLETED" || s === "STOPPED" || s === "FAILED",
      );
      if (allTerminal) {
        const allFailed = statuses.every((s) => s === "FAILED");
        await this.webhookRepo.updateCampaignStatus(
          call.campaignId,
          allFailed ? "FAILED" : "COMPLETED",
          new Date(),
        );
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
