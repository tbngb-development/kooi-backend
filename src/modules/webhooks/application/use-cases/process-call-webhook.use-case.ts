import {
  type WebhookRepository,
  type ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import { type WebhookCallPayload } from "../dto/webhook.dto";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import {
  sanitizeEnum,
  DISPOSITION_VALUES,
  LEAD_TEMPERATURE_VALUES,
  PURCHASE_TIMELINE_VALUES,
  PURCHASE_PURPOSE_VALUES,
  LOCATION_MATCH_VALUES,
  PREFERRED_NEXT_ACTION_VALUES,
  CONTACT_CHANNEL_VALUES,
  EXTRACTION_FLAG_VALUES,
} from "../../domain/rules/webhook-sanitizer";
import type {
  CallHistoryItem,
  ParsedCallAnalysis,
} from "../../../../shared/types/bolna.types";
import type { DebitWalletForCallUseCase } from "../../../wallet/application/use-cases/debit-wallet.use-case";
import prisma from "../../../../shared/config/database/prisma";
import type { InputJsonValue } from "@prisma/client/runtime/library";

import type {
  ExtractionConfig,
  ExtractionMetricConfig,
  ExtractionResultConfig,
  ExtractionMetricResponse,
  ExtractionResultResponse,
  ExtractionResponse,
} from "../../../../shared/types/bolna.types";

interface DynamicExtractionEntry {
  localDispositionId: string | null;
  localDispositionSlug: string | null;
  subjective: string | null;
  objective: string | null;
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

    // [NEW] Map extracted_data to local dispositions AND build dynamic response
    try {
      const dynamicResult = await this.mapCallExtractions(
        call.id,
        call.tenantId,
        payload.extracted_data as Record<string, unknown> | null | undefined,
      );

      if (dynamicResult) {
        await this.buildExtractionResponse(
          call.id,
          call.tenantId,
          dynamicResult,
        );
      }
    } catch (err) {
      // Best-effort — don't fail the webhook if extraction mapping fails
      console.error("[Webhook] Dynamic extraction mapping failed:", err);
    }

    const parsed = this.parseExtractionData(payload.extracted_data);
    const summary = parsed?.callSummary ?? null;

    // ── Step 1: Persist terminal state (Bolna cost in `cost` field) ──
    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "COMPLETED",
      summary,
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

    if (parsed) {
      await this.webhookRepo.upsertCallAnalysis(call.id, call.tenantId, parsed);
      if (parsed.doNotCall === "YES") {
        await this.webhookRepo.updateLeadStatus(call.leadId, "CALLED", true);
      }
    }

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
    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "FAILED",
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, "PENDING");
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
    const dispositionLookup = new Map<string, { id: string; slug: string }>();
    for (const disp of agentMap.dispositions) {
      dispositionLookup.set(disp.name.toLowerCase(), {
        id: disp.id,
        slug: disp.slug,
      });
      dispositionLookup.set(disp.slug.toLowerCase(), {
        id: disp.id,
        slug: disp.slug,
      });
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
   * Reads the PlatformAgent's extractionConfig and the just-computed
   * dynamicExtractions to produce the { metrics, results } response.
   * Stores the result in CallAnalysis.extractionResponse.
   */
  private async buildExtractionResponse(
    callId: string,
    tenantId: string,
    dynamicResult: DynamicExtractionMap,
  ): Promise<void> {
    const agentConfig =
      await this.webhookRepo.getExtractionConfigForCall(callId);

    if (!agentConfig) return;

    const config = agentConfig.extractionConfig as ExtractionConfig | null;
    if (!config) return;

    // Build a case-insensitive lookup of dynamic extractions
    // Key: "category|disposition" (both lowercased)
    const dynamicLookup = new Map<string, DynamicExtractionEntry>();
    for (const [catName, dispositions] of Object.entries(dynamicResult)) {
      for (const [dispName, entry] of Object.entries(dispositions)) {
        const key = `${catName.toLowerCase()}|${dispName.toLowerCase()}`;
        dynamicLookup.set(key, entry);
      }
    }

    // ── Build metrics ───────────────────────────────────────────────────
    const metrics: ExtractionMetricResponse[] = [];
    for (const metric of config.metrics) {
      const key = `${metric.category.toLowerCase()}|${metric.disposition.toLowerCase()}`;
      const entry = dynamicLookup.get(key);

      const actualValue = entry?.objective ?? null;
      const matched =
        actualValue !== null &&
        actualValue.toLowerCase() === metric.matchValue.toLowerCase();

      metrics.push({
        label: metric.label,
        category: metric.category,
        disposition: metric.disposition,
        matchValue: metric.matchValue,
        matched,
        actualValue,
      });
    }

    // ── Build results ───────────────────────────────────────────────────
    const results: ExtractionResultResponse[] = [];
    for (const result of config.results) {
      const key = `${result.category.toLowerCase()}|${result.disposition.toLowerCase()}`;
      const entry = dynamicLookup.get(key);

      results.push({
        label: result.label,
        category: result.category,
        disposition: result.disposition,
        value: entry?.subjective ?? null,
      });
    }

    const response: ExtractionResponse = { metrics, results };

    await this.materializeCallMetrics(callId, tenantId, metrics);

    await this.webhookRepo.updateExtractionResponse(callId, tenantId, response);
  }

  /**
   * Inserts one row per metric evaluation into CallMetric for fast
   * aggregation and filtering. Idempotent — deletes old rows for this
   * call before inserting (handles webhook retries safely).
   */
  private async materializeCallMetrics(
    callId: string,
    tenantId: string,
    metrics: ExtractionMetricResponse[],
  ): Promise<void> {
    const validMetrics = metrics.filter(
      (m) => m.actualValue != null && m.actualValue !== "",
    );

    if (validMetrics.length === 0) return;

    // Fetch call metadata for denormalization
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { campaignId: true, batchId: true },
    });

    if (!call) return;

    const toFilterKey = (label: string): string =>
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

    // Idempotent: remove previous metrics for this call (webhook retries)
    await prisma.callMetric.deleteMany({ where: { callId } });

    // Bulk insert all metric evaluations
    await prisma.callMetric.createMany({
      data: validMetrics.map((m) => ({
        callId,
        tenantId,
        campaignId: call.campaignId,
        batchId: call.batchId,
        metricKey: toFilterKey(m.label),
        metricLabel: m.label,
        matched: m.matched,
        actualValue: m.actualValue!,
        matchValue: m.matchValue,
      })),
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

  // ── Extractor Mapper ─────────────────────────────────────────────────────

  private parseExtractionData(
    extracted: Record<string, any> | null | undefined,
  ): ParsedCallAnalysis | null {
    if (!extracted) return null;

    const obj = (field: any) => field?.objective?.trim() ?? null;
    const subj = (field: any) => field?.subjective?.trim() ?? null;

    const outcome = extracted["Call Outcome"];
    const qualification = extracted["Lead Qualification"];
    const nextAction = extracted["Next Action and Contact Preference"];
    const followUp = extracted["Follow-Up Schedule"];
    const compliance = extracted["Compliance"];
    const summary = extracted["Summary"];

    return {
      disposition: sanitizeEnum(obj(outcome?.disposition), DISPOSITION_VALUES),
      leadTemperature: sanitizeEnum(
        obj(outcome?.lead_temperature),
        LEAD_TEMPERATURE_VALUES,
      ),
      purchaseTimeline: sanitizeEnum(
        obj(qualification?.purchase_timeline),
        PURCHASE_TIMELINE_VALUES,
      ),
      purchasePurpose: sanitizeEnum(
        obj(qualification?.purchase_purpose),
        PURCHASE_PURPOSE_VALUES,
      ),
      locationMatch: sanitizeEnum(
        obj(qualification?.location_match),
        LOCATION_MATCH_VALUES,
      ),
      preferredNextAction: sanitizeEnum(
        obj(nextAction?.preferred_next_action),
        PREFERRED_NEXT_ACTION_VALUES,
      ),
      preferredContactChannel: sanitizeEnum(
        obj(nextAction?.preferred_contact_channel),
        CONTACT_CHANNEL_VALUES,
      ),
      doNotCall: sanitizeEnum(
        obj(compliance?.do_not_call),
        EXTRACTION_FLAG_VALUES,
      ),
      languageSupportRequired: sanitizeEnum(
        obj(compliance?.language_support_required),
        EXTRACTION_FLAG_VALUES,
      ),
      preferredConfiguration: subj(qualification?.preferred_configuration),
      budgetRange: subj(qualification?.budget_range),
      customerLocationPref: subj(qualification?.customer_location_pref),
      followupSchedule: subj(followUp?.followup_schedule),
      callSummary: subj(summary?.call_summary),
    };
  }
}
