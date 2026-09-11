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
      cost: payload.total_cost ?? null, // Bolna cost in USD cents
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
    // ───────────────────────────────────────────────────────────────

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
