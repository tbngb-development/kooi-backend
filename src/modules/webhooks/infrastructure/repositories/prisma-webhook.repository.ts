import prisma from "../../../../shared/config/database/prisma";
import {
  type CallStatus,
  type LeadStatus,
  type BatchStatus,
  type CampaignStatus,
  type Disposition,
  type LeadTemperature,
  type PurchaseTimeline,
  type PurchasePurpose,
  type LocationMatch,
  type PreferredNextAction,
  type ContactChannel,
  type ExtractionFlag,
  type Prisma,
} from "@prisma/client";
import type {
  WebhookRepository,
  ResolvedCallContext,
  AgentDispositionMap,
} from "../../application/interfaces/webhook-repository.interface";
import type {
  CallHistoryItem,
  ParsedCallAnalysis,
} from "../../../../shared/types/bolna.types";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export class PrismaWebhookRepository implements WebhookRepository {
  async findCallByBolnaCallId(
    bolnaCallId: string,
  ): Promise<ResolvedCallContext | null> {
    const call = await prisma.call.findUnique({
      where: { bolnaCallId },
    });
    return call ? this.toMapContext(call) : null;
  }

  async findCallByLeadAndBatch(
    leadId: string,
    batchId: string,
  ): Promise<ResolvedCallContext | null> {
    const call = await prisma.call.findFirst({
      where: { leadId, batchId },
      orderBy: { createdAt: "desc" },
    });
    return call ? this.toMapContext(call) : null;
  }

  async findBatchIdByBolnaBatchId(bolnaBatchId: string): Promise<{
    id: string;
    tenantId: string;
    campaignId: string;
    status: BatchStatus;
  } | null> {
    const batch = await prisma.leadBatch.findUnique({
      where: { bolnaBatchId },
      select: { id: true, tenantId: true, campaignId: true, status: true },
    });
    if (!batch) return null;
    return {
      id: batch.id,
      tenantId: batch.tenantId,
      campaignId: batch.campaignId,
      status: batch.status as BatchStatus,
    };
  }

  async findLeadByPhoneAndBatch(
    phone: string,
    batchId: string,
  ): Promise<{ id: string } | null> {
    return prisma.lead.findFirst({
      where: { phone, batchId },
      select: { id: true },
    });
  }

  async findLeadByPhoneAndCampaign(
    phone: string,
    campaignId: string,
  ): Promise<{ id: string } | null> {
    return prisma.lead.findFirst({
      where: { phone, campaignId },
      select: { id: true },
    });
  }

  async createCall(data: {
    bolnaCallId: string;
    tenantId: string;
    campaignId: string;
    leadId: string;
    batchId: string | null;
    status: CallStatus;
    startedAt: Date;
  }): Promise<ResolvedCallContext> {
    const call = await prisma.call.create({
      data: {
        bolnaCallId: data.bolnaCallId,
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        leadId: data.leadId,
        batchId: data.batchId,
        status: data.status,
        startedAt: data.startedAt,
      },
    });
    return this.toMapContext(call);
  }

  async updateCallStatusAndHistory(
    callId: string,
    bolnaCallId: string,
    status: CallStatus,
    history: CallHistoryItem[],
  ): Promise<ResolvedCallContext> {
    const call = await prisma.call.update({
      where: { id: callId },
      data: {
        bolnaCallId,
        status,
        callHistory: history as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toMapContext(call);
  }

  async updateCallTerminalState(
    callId: string,
    data: {
      status: CallStatus;
      summary?: string | null;
      transcript?: string | null;
      transcriptMessages?: unknown | null;
      duration?: number | null;
      recording?: string | null;
      cost?: number | null;
      extracted_data?: Record<string, any> | null;
      endedAt: Date;
    },
  ): Promise<void> {
    await prisma.call.update({
      where: { id: callId },
      data: {
        status: data.status,
        summary: data.summary,
        transcript: data.transcript,
        transcriptMessages:
          data.transcriptMessages as unknown as Prisma.InputJsonValue,
        duration: data.duration,
        recording: data.recording,
        extractionResult: data.extracted_data as InputJsonValue,
        cost: data.cost,
        endedAt: data.endedAt,
      },
    });
  }

  async updateLeadStatus(
    leadId: string,
    status: LeadStatus,
    doNotCall?: boolean,
  ): Promise<void> {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status,
        ...(doNotCall !== undefined && { doNotCall }),
      },
    });
  }

  async upsertCallAnalysis(
    callId: string,
    tenantId: string,
    analysis: ParsedCallAnalysis,
  ): Promise<void> {
    const data = {
      disposition: (analysis.disposition as Disposition) ?? null,
      leadTemperature: (analysis.leadTemperature as LeadTemperature) ?? null,
      preferredConfiguration: analysis.preferredConfiguration ?? null,
      budgetRange: analysis.budgetRange ?? null,
      purchaseTimeline: (analysis.purchaseTimeline as PurchaseTimeline) ?? null,
      purchasePurpose: (analysis.purchasePurpose as PurchasePurpose) ?? null,
      locationMatch: (analysis.locationMatch as LocationMatch) ?? null,
      customerLocationPref: analysis.customerLocationPref ?? null,
      preferredNextAction:
        (analysis.preferredNextAction as PreferredNextAction) ?? null,
      preferredContactChannel:
        (analysis.preferredContactChannel as ContactChannel) ?? null,
      followupSchedule: analysis.followupSchedule ?? null,
      doNotCall: (analysis.doNotCall as ExtractionFlag) ?? null,
      languageSupportRequired:
        (analysis.languageSupportRequired as ExtractionFlag) ?? null,
    };

    await prisma.callAnalysis.upsert({
      where: { callId },
      create: {
        callId,
        tenantId,
        ...data,
      },
      update: data,
    });
  }

  async incrementTerminalStats(
    campaignId: string,
    batchId: string | null,
    status: CallStatus,
  ): Promise<void> {
    const isCompleted = status === "COMPLETED";
    const isFailed = status === "FAILED";

    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id: campaignId },
        data: {
          calledLeads: { increment: 1 },
          ...(isCompleted && { completedLeads: { increment: 1 } }),
          ...(isFailed && { failedLeads: { increment: 1 } }),
        },
      });

      if (batchId) {
        await tx.leadBatch.update({
          where: { id: batchId },
          data: {
            calledLeads: { increment: 1 },
            ...(isCompleted && { completedLeads: { increment: 1 } }),
            ...(isFailed && { failedLeads: { increment: 1 } }),
          },
        });
      }
    });
  }

  async countActiveLeadsInBatch(batchId: string): Promise<number> {
    return prisma.lead.count({
      where: {
        batchId,
        status: { in: ["PENDING", "CALLING"] },
      },
    });
  }

  async countActiveLeadsInCampaignLegacy(campaignId: string): Promise<number> {
    return prisma.lead.count({
      where: {
        campaignId,
        status: { in: ["PENDING", "CALLING"] },
      },
    });
  }

  async getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]> {
    const batches = await prisma.leadBatch.findMany({
      where: { campaignId },
      select: { status: true },
    });
    return batches.map((b) => b.status as BatchStatus);
  }

  async updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    completedAt?: Date,
  ): Promise<void> {
    await prisma.leadBatch.update({
      where: { id: batchId },
      data: {
        status,
        ...(completedAt && { completedAt }),
      },
    });
  }

  async updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    completedAt?: Date,
  ): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status,
        ...(completedAt && { completedAt }),
      },
    });
  }

  async updateCallCostBreakdown(
    callId: string,
    data: {
      platformCost: number;
      billableSeconds: number;
      planVersionId: string;
      appliedRate: number;
      appliedMinSec: number;
      appliedIncrementSec: number;
      chargedAmount: number;
    },
  ): Promise<void> {
    await prisma.call.update({
      where: { id: callId },
      data: {
        platformCost: data.platformCost,
        billableSeconds: data.billableSeconds,
        planVersionId: data.planVersionId,
        appliedRate: data.appliedRate,
        appliedMinSec: data.appliedMinSec,
        appliedIncrementSec: data.appliedIncrementSec,
        chargedAmount: data.chargedAmount,
      },
    });
  }

  // ── [NEW] Agent Disposition Resolution ──────────────────────────────────

  async getAgentDispositionsForCall(
    callId: string,
  ): Promise<AgentDispositionMap> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        campaign: {
          select: {
            assistant: {
              select: {
                platformAgentId: true,
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
                                    slug: true,
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

    const platformAgent = call?.campaign?.assistant?.platformAgent ?? null;
    const platformAgentId = call?.campaign?.assistant?.platformAgentId ?? null;

    if (!platformAgent) {
      return { platformAgentId, dispositions: [] };
    }

    const seen = new Set<string>();
    const dispositions: { id: string; name: string; slug: string }[] = [];

    // All dispositions come through categories (including "General")
    for (const cat of platformAgent.categories) {
      for (const cd of cat.category.dispositions) {
        if (!seen.has(cd.disposition.id)) {
          seen.add(cd.disposition.id);
          dispositions.push(cd.disposition);
        }
      }
    }

    return { platformAgentId, dispositions };
  }

  private toMapContext(c: {
    id: string;
    bolnaCallId: string | null;
    tenantId: string;
    campaignId: string;
    leadId: string;
    batchId: string | null;
    status: string;
    duration: number | null;
    cost: number | null;
    recording: string | null;
    transcript: string | null;
    summary: string | null;
    callHistory?: Prisma.JsonValue;
    updatedAt: Date;
  }): ResolvedCallContext {
    return {
      id: c.id,
      bolnaCallId: c.bolnaCallId,
      tenantId: c.tenantId,
      campaignId: c.campaignId,
      leadId: c.leadId,
      batchId: c.batchId,
      status: c.status as CallStatus,
      duration: c.duration,
      cost: c.cost,
      recording: c.recording,
      transcript: c.transcript,
      summary: c.summary,
      callHistory: Array.isArray(c.callHistory)
        ? (c.callHistory as unknown as CallHistoryItem[])
        : [],
      updatedAt: c.updatedAt,
    };
  }
}
