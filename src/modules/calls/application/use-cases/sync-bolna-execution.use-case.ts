// modules/calls/application/use-cases/sync-bolna-execution.use-case.ts

import prisma from "../../../../shared/config/database/prisma";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { DebitWalletForCallUseCase } from "../../../wallet/application/use-cases/debit-wallet.use-case";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import type { CallStatus, LeadStatus } from "@prisma/client";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import type { Queue } from "bull";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";

export interface SyncBolnaExecutionInput {
  callId?: string;
  bolnaExecutionId?: string;
  tenantId?: string;
}

export interface SyncBolnaExecutionOutput {
  success: boolean;
  message: string;
  call: unknown;
  execution: unknown;
}

interface DynamicExtractionEntry {
  localDispositionId: string | null;
  localDispositionDisplayName: string | null;
  localDispositionSlug: string | null;
  subjective: string | null;
  objective: string | null;
  sortOrder?: number | null;
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

function mapBolnaStatusToCallStatus(status?: string | null): CallStatus {
  const s = (status ?? "").toLowerCase().trim();
  switch (s) {
    case "completed":
    case "ended":
    case "call-completed":
      return "COMPLETED";
    case "busy":
      return "BUSY";
    case "no-answer":
    case "no_answer":
      return "NO_ANSWER";
    case "failed":
    case "error":
    case "balance-low":
      return "FAILED";
    case "stopped":
    case "canceled":
    case "cancelled":
      return "STOPPED";
    case "calling":
    case "in-progress":
    case "ringing":
      return "CALLING";
    default:
      return "COMPLETED";
  }
}

function mapCallStatusToLeadStatus(status: CallStatus, durationSec: number): LeadStatus {
  if (status === "COMPLETED" || durationSec > 0) return "CALLED";
  if (status === "BUSY") return "BUSY";
  if (status === "NO_ANSWER") return "NO_ANSWER";
  if (status === "FAILED") return "FAILED";
  if (status === "STOPPED") return "STOPPED";
  return "CALLED";
}

export class SyncBolnaExecutionUseCase {
  constructor(
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly debitWalletForCall?: DebitWalletForCallUseCase,
    private readonly classifierQueue?: Queue,
    private readonly logger?: Logger,
  ) {}

  async execute(input: SyncBolnaExecutionInput): Promise<SyncBolnaExecutionOutput> {
    let callRecord: {
      id: string;
      bolnaCallId: string | null;
      tenantId: string;
      campaignId: string;
      leadId: string;
      batchId: string | null;
      status: CallStatus;
      callHistory: unknown;
    } | null = null;

    let resolvedBolnaId = input.bolnaExecutionId;
    let resolvedTenantId = input.tenantId;

    // 1. Try to resolve existing call from database if callId is provided
    if (input.callId) {
      callRecord = await prisma.call.findFirst({
        where: {
          OR: [
            { id: input.callId },
            { bolnaCallId: input.callId },
          ],
        },
        select: {
          id: true,
          bolnaCallId: true,
          tenantId: true,
          campaignId: true,
          leadId: true,
          batchId: true,
          status: true,
          callHistory: true,
        },
      });

      if (callRecord) {
        resolvedBolnaId = resolvedBolnaId ?? callRecord.bolnaCallId ?? undefined;
        resolvedTenantId = resolvedTenantId ?? callRecord.tenantId;
      }
    }

    // 2. If call was not found by callId, try finding by bolnaExecutionId
    if (!callRecord && resolvedBolnaId) {
      callRecord = await prisma.call.findUnique({
        where: { bolnaCallId: resolvedBolnaId },
        select: {
          id: true,
          bolnaCallId: true,
          tenantId: true,
          campaignId: true,
          leadId: true,
          batchId: true,
          status: true,
          callHistory: true,
        },
      });

      if (callRecord) {
        resolvedTenantId = resolvedTenantId ?? callRecord.tenantId;
      }
    }

    if (!resolvedBolnaId) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        "Bolna execution ID could not be determined. Please provide a bolnaExecutionId or a callId linked to Bolna.",
        "MISSING_BOLNA_EXECUTION_ID",
      );
    }

    this.logger?.info("Reconciling call from Bolna execution", {
      action: "admin.call.sync_bolna",
      bolnaExecutionId: resolvedBolnaId,
      callId: callRecord?.id,
      tenantId: resolvedTenantId,
    });

    // 3. Resolve Bolna client (tenant-specific key with platform default fallback)
    const bolnaClient = await this.bolnaClientFactory.forTenant(resolvedTenantId ?? "");

    // 4. Fetch execution details directly from Bolna
    const execution = await bolnaClient.executions.get(resolvedBolnaId);
    if (!execution || !execution.id) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        `Bolna execution "${resolvedBolnaId}" not found on provider.`,
        "BOLNA_EXECUTION_NOT_FOUND",
      );
    }

    // 5. If call record was not found, attempt to resolve or link by batch and lead phone
    if (!callRecord) {
      const bolnaBatchId = execution.batch_id;
      const recipientPhone =
        execution.telephony_data?.to_number ??
        execution.context_details?.recipient_data?.phone ??
        (execution as any).user_number;

      if (bolnaBatchId && recipientPhone) {
        const batch = await prisma.leadBatch.findFirst({
          where: { bolnaBatchId },
          select: { id: true, tenantId: true, campaignId: true },
        });

        if (batch) {
          const normalizedPhone = normalizePhoneNumber(recipientPhone);
          const lead = await prisma.lead.findFirst({
            where: {
              campaignId: batch.campaignId,
              phone: normalizedPhone,
            },
            select: { id: true },
          });

          if (lead) {
            callRecord = await prisma.call.create({
              data: {
                bolnaCallId: execution.id,
                tenantId: batch.tenantId,
                campaignId: batch.campaignId,
                leadId: lead.id,
                batchId: batch.id,
                status: "PENDING",
              },
              select: {
                id: true,
                bolnaCallId: true,
                tenantId: true,
                campaignId: true,
                leadId: true,
                batchId: true,
                status: true,
                callHistory: true,
              },
            });
          }
        }
      }
    }

    if (!callRecord) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        `No matching call record found in system for Bolna execution "${resolvedBolnaId}".`,
        "CALL_NOT_FOUND",
      );
    }

    // 6. Map verified execution status (ground truth — never set to SCHEDULED!)
    const verifiedCallStatus: CallStatus = mapBolnaStatusToCallStatus(execution.status);

    // 7. Extract & normalize call metrics
    const rawDuration =
      execution.telephony_data?.duration ??
      execution.conversation_duration ??
      0;
    const duration =
      typeof rawDuration === "string"
        ? parseInt(rawDuration, 10) || 0
        : Number(rawDuration) || 0;

    const recording = execution.telephony_data?.recording_url ?? null;
    const transcript = execution.transcript ?? null;
    const summary = execution.summary ?? null;
    const cost = execution.total_cost ?? null;

    // Parse transcript messages
    let transcriptMessages: Array<{ role: string; message: string; time: string | null }> | null = null;
    if (Array.isArray((execution as any).messages) && (execution as any).messages.length > 0) {
      transcriptMessages = (execution as any).messages.map((m: any) => ({
        role: m.role === "agent" ? "assistant" : m.role,
        message: m.content,
        time: m.created_at ?? null,
      }));
    } else if (transcript && typeof transcript === "string") {
      const parsed = transcript
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          const match = trimmed.match(/^(assistant|user|agent|system|bot|customer):\s*(.*)$/i);
          if (match) {
            const rawRole = match[1].toLowerCase();
            const role =
              rawRole === "agent" || rawRole === "bot"
                ? "assistant"
                : rawRole === "customer"
                  ? "user"
                  : rawRole;
            return { role, message: match[2].trim(), time: null };
          }
          return { role: "assistant", message: trimmed, time: null };
        })
        .filter(Boolean) as Array<{ role: string; message: string; time: string | null }>;

      if (parsed.length > 0) {
        transcriptMessages = parsed;
      }
    }

    // Build call history
    const historyList: CallHistoryItem[] = Array.isArray(callRecord.callHistory)
      ? [...(callRecord.callHistory as CallHistoryItem[])]
      : [];

    const existingHistoryIdx = historyList.findIndex(
      (h) => h.bolnaCallId === execution.id || (h.attempt === 1 && !h.bolnaCallId),
    );

    const historyEntry: CallHistoryItem = {
      attempt:
        existingHistoryIdx >= 0
          ? historyList[existingHistoryIdx].attempt
          : historyList.length + 1,
      bolnaCallId: execution.id,
      status: verifiedCallStatus,
      duration,
      cost,
      timestamp: execution.created_at ?? new Date().toISOString(),
      errorMessage: execution.error_message ?? null,
      hangupReason: (execution.telephony_data as any)?.hangup_reason ?? null,
    };

    if (existingHistoryIdx >= 0) {
      historyList[existingHistoryIdx] = historyEntry;
    } else {
      historyList.push(historyEntry);
    }

    // 8. Update Call record with verified ground truth details
    await prisma.call.update({
      where: { id: callRecord.id },
      data: {
        bolnaCallId: execution.id,
        status: verifiedCallStatus,
        duration,
        cost,
        recording,
        transcript,
        transcriptMessages: transcriptMessages ? (transcriptMessages as unknown as InputJsonValue) : undefined,
        summary,
        extractionResult: execution.extracted_data ? (execution.extracted_data as unknown as InputJsonValue) : undefined,
        callHistory: historyList as unknown as InputJsonValue,
        endedAt: new Date(),
      },
    });

    // 9. Debit wallet atomically with integer double-entry ledger tracking (if billable duration > 0)
    if (this.debitWalletForCall && duration > 0) {
      try {
        const debitResult = await this.debitWalletForCall.execute({
          tenantId: callRecord.tenantId,
          callId: callRecord.id,
          bolnaCallId: execution.id,
          durationSec: duration,
        });

        if (debitResult) {
          await prisma.call.update({
            where: { id: callRecord.id },
            data: {
              platformCost: debitResult.amountPaisa,
              billableSeconds: debitResult.billableSeconds,
              planVersionId: debitResult.planVersionId,
              appliedRate: debitResult.appliedRate,
              appliedMinSec: debitResult.appliedMinSec,
              appliedIncrementSec: debitResult.appliedIncrementSec,
              chargedAmount: debitResult.amountPaisa,
            },
          });
        }
      } catch (err) {
        this.logger?.error("Wallet debit failed during sync execution", err, {
          action: "call.sync.debit_failed",
          callId: callRecord.id,
          tenantId: callRecord.tenantId,
        });
      }
    }

    // 10. Process dynamic extractions (overview & insights materialization)
    if (
      execution.extracted_data &&
      typeof execution.extracted_data === "object" &&
      Object.keys(execution.extracted_data).length > 0
    ) {
      try {
        const dynamicResult = await this.mapCallExtractions(
          callRecord.id,
          callRecord.tenantId,
          execution.extracted_data as Record<string, unknown>,
        );

        if (dynamicResult) {
          await this.materializeExtractionOverview(
            callRecord.id,
            callRecord.tenantId,
            dynamicResult,
          );
          await this.materializeExtractionInsights(
            callRecord.id,
            callRecord.tenantId,
            dynamicResult,
          );
        }
      } catch (err) {
        this.logger?.error("Dynamic extraction mapping failed during sync execution", err, {
          action: "call.sync.extraction_failed",
          callId: callRecord.id,
          tenantId: callRecord.tenantId,
        });
      }
    }

    // 11. Update Lead Status
    const leadStatus = mapCallStatusToLeadStatus(verifiedCallStatus, duration);
    await prisma.lead.update({
      where: { id: callRecord.leadId },
      data: { status: leadStatus },
    });

    // 12. Increment campaign and batch statistics (if previously not marked terminal)
    const isPriorTerminal = [
      "COMPLETED",
      "BUSY",
      "NO_ANSWER",
      "FAILED",
      "STOPPED",
    ].includes(callRecord.status);

    if (!isPriorTerminal) {
      const updateData = {
        calledLeads: { increment: 1 },
        ...(verifiedCallStatus === "COMPLETED" && { completedLeads: { increment: 1 } }),
        ...(verifiedCallStatus === "FAILED" && { failedLeads: { increment: 1 } }),
      };

      await prisma.campaign.updateMany({
        where: { id: callRecord.campaignId },
        data: updateData,
      });

      if (callRecord.batchId) {
        await prisma.leadBatch.updateMany({
          where: { id: callRecord.batchId },
          data: updateData,
        });
      }
    }

    // 13. Enqueue Post-Call JEV Classifier (if transcript exists)
    if (this.classifierQueue && transcript) {
      this.classifierQueue
        .add(
          { callId: callRecord.id, tenantId: callRecord.tenantId },
          { jobId: `classifier-${callRecord.id}` },
        )
        .catch((err) =>
          this.logger?.warn("Classifier enqueue failed during sync execution", {
            action: "call.sync.classifier_enqueue_failed",
            callId: callRecord.id,
            error: err?.message,
          }),
        );
    }

    // 14. Check Batch Completion
    if (callRecord.batchId) {
      const activeLeadsCount = await prisma.lead.count({
        where: {
          batchId: callRecord.batchId,
          status: { in: ["PENDING", "CALLING"] },
        },
      });

      if (activeLeadsCount === 0) {
        await prisma.leadBatch.updateMany({
          where: {
            id: callRecord.batchId,
            status: { notIn: ["COMPLETED", "STOPPED", "FAILED"] },
          },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      }
    }

    // 15. Fetch refreshed call record with full relations
    const updatedCall = await prisma.call.findUnique({
      where: { id: callRecord.id },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            stoppedReason: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        batch: {
          select: {
            id: true,
            status: true,
          },
        },
        callAnalysis: true,
        extractionOverview: true,
        extractionInsights: true,
        classifierResult: true,
      },
    });

    return {
      success: true,
      message: `Call reconciled from Bolna execution (status: ${verifiedCallStatus}).`,
      call: updatedCall,
      execution,
    };
  }

  // ── Extractions Private Helpers ───────────────────────────────────────────

  private async mapCallExtractions(
    callId: string,
    tenantId: string,
    extractedData: Record<string, unknown>,
  ): Promise<DynamicExtractionMap | null> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        campaign: {
          select: {
            assistant: {
              select: {
                platformAgent: {
                  select: {
                    id: true,
                    categories: {
                      select: {
                        category: {
                          select: {
                            dispositions: {
                              select: {
                                disposition: {
                                  select: {
                                    id: true,
                                    name: true,
                                    displayName: true,
                                    slug: true,
                                    isObjective: true,
                                    isSubjective: true,
                                    objectiveOptions: true,
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const platformAgent = call?.campaign?.assistant?.platformAgent;
    if (!platformAgent || platformAgent.categories.length === 0) {
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
        objectiveOptions?: Array<{
          value: string;
          condition: string;
          sortOrder?: number;
          sub_options?: unknown[];
        }> | null;
      }
    >();

    for (const catRel of platformAgent.categories) {
      for (const dispRel of catRel.category.dispositions) {
        const d = dispRel.disposition;
        const entry = {
          id: d.id,
          slug: d.slug,
          displayName: d.displayName,
          isObjective: d.isObjective,
          isSubjective: d.isSubjective,
          objectiveOptions: d.objectiveOptions as any,
        };
        dispositionLookup.set(d.name.toLowerCase(), entry);
        dispositionLookup.set(d.slug.toLowerCase(), entry);
      }
    }

    const dynamicResult: DynamicExtractionMap = {};

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

        let sortOrder: number | null = null;
        if (
          localDisp?.isObjective &&
          value.objective != null &&
          localDisp.objectiveOptions &&
          Array.isArray(localDisp.objectiveOptions)
        ) {
          const cleanObj = String(value.objective).trim().toLowerCase();
          const matchedIdx = localDisp.objectiveOptions.findIndex(
            (opt) => opt.value?.trim().toLowerCase() === cleanObj,
          );
          if (matchedIdx !== -1) {
            const matchedOpt = localDisp.objectiveOptions[matchedIdx];
            sortOrder =
              typeof matchedOpt.sortOrder === "number"
                ? matchedOpt.sortOrder
                : matchedIdx;
          }
        }

        const entry: DynamicExtractionEntry = {
          localDispositionId: localDisp?.id ?? null,
          localDispositionSlug: localDisp?.slug ?? null,
          localDispositionDisplayName: localDisp?.displayName ?? null,
          subjective: (value.subjective as string) ?? null,
          objective: (value.objective as string) ?? null,
          sortOrder,
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
      }

      dynamicResult[categoryName] = categoryResult;
    }

    await prisma.callAnalysis.upsert({
      where: { callId },
      create: {
        callId,
        tenantId,
        extractionResult: extractedData as unknown as InputJsonValue,
        dynamicExtractions: dynamicResult as unknown as InputJsonValue,
      },
      update: {
        extractionResult: extractedData as unknown as InputJsonValue,
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
      sortOrder: number;
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
            sortOrder: entry.sortOrder ?? 0,
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
        sortOrder: e.sortOrder,
      })),
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
  }
}
