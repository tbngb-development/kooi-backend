import prisma from "../../../../shared/config/database/prisma";
import type {
  WebhookRepository,
  ResolvedCallContext,
  AgentDispositionMap,
} from "../../application/interfaces/webhook-repository.interface";
import type {
  CallStatus,
  BatchStatus,
  LeadStatus,
  CampaignStatus,
  LeadStopReason,
} from "@prisma/client";

import type { CallHistoryItem, RetryConfig } from "../../../../shared/types/bolna.types";

const callSelectFields = {
  id: true,
  bolnaCallId: true,
  tenantId: true,
  campaignId: true,
  leadId: true,
  batchId: true,
  status: true,
  duration: true,
  cost: true,
  recording: true,
  transcript: true,
  summary: true,
  callHistory: true,
  updatedAt: true,
  batch: {
    select: {
      retryConfig: true,
      scheduledAt: true,
    },
  },
  campaign: {
    select: {
      defaultRetryConfig: true,
    },
  },
} as const;

export class PrismaWebhookRepository implements WebhookRepository {
  private toResolvedContext(raw: {
    id: string;
    bolnaCallId: string | null;
    tenantId: string;
    campaignId: string;
    leadId: string;
    batchId: string | null;
    status: CallStatus;
    duration: number | null;
    cost: number | null;
    recording: string | null;
    transcript: string | null;
    summary: string | null;
    callHistory: unknown;
    updatedAt: Date;
    batch?: {
      retryConfig: unknown;
      scheduledAt?: Date | null;
    } | null;
    campaign?: {
      defaultRetryConfig: unknown;
    } | null;
  }): ResolvedCallContext {
    return {
      ...raw,
      callHistory: (raw.callHistory as CallHistoryItem[]) ?? [],
      retryConfig: (raw.batch?.retryConfig as RetryConfig | null) ?? null,
      campaignDefaultRetryConfig: (raw.campaign?.defaultRetryConfig as RetryConfig | null) ?? null,
    };
  }

  async findCallByBolnaCallId(
    bolnaCallId: string,
  ): Promise<ResolvedCallContext | null> {
    const call = await prisma.call.findUnique({
      where: { bolnaCallId },
      select: callSelectFields,
    });
    if (!call) return null;
    return this.toResolvedContext(call);
  }

  async findBatchIdByBolnaBatchId(bolnaBatchId: string) {
    return prisma.leadBatch.findUnique({
      where: { bolnaBatchId },
      select: {
        id: true,
        campaignId: true,
        tenantId: true,
        status: true,
        scheduledAt: true,
      },
    });
  }

  async findLeadByPhoneAndBatch(phone: string, batchId: string) {
    return prisma.lead.findFirst({
      where: { phone, batchId },
      select: { id: true, phone: true },
    });
  }

  async findLeadByPhoneAndCampaign(phone: string, campaignId: string) {
    return prisma.lead.findFirst({
      where: { phone, campaignId },
      select: { id: true, phone: true },
    });
  }

  async findCallByLeadAndBatch(
    leadId: string,
    batchId: string,
  ): Promise<ResolvedCallContext | null> {
    const call = await prisma.call.findFirst({
      where: { leadId, batchId },
      select: callSelectFields,
    });
    if (!call) return null;
    return this.toResolvedContext(call);
  }

  async createCall(data: {
    bolnaCallId: string;
    tenantId: string;
    campaignId: string;
    leadId: string;
    batchId: string | null;
    status: string;
    startedAt: Date;
  }): Promise<ResolvedCallContext> {
    const call = await prisma.call.create({
      data: {
        bolnaCallId: data.bolnaCallId,
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        leadId: data.leadId,
        batchId: data.batchId,
        status: data.status as CallStatus,
        startedAt: data.startedAt,
      },
      select: callSelectFields,
    });
    return this.toResolvedContext(call);
  }

  async updateCallStatusAndHistory(
    callId: string,
    bolnaCallId: string,
    status: CallStatus,
    callHistory: unknown[],
  ): Promise<ResolvedCallContext> {
    const call = await prisma.call.update({
      where: { id: callId },
      data: {
        bolnaCallId,
        status,
        callHistory: callHistory as any,
      },
      select: callSelectFields,
    });
    return this.toResolvedContext(call);
  }

  async updateCallTerminalState(
    callId: string,
    data: {
      status: string;
      summary?: string | null;
      transcript?: string | null;
      transcriptMessages?: unknown;
      duration?: number | null;
      recording?: string | null;
      cost?: number | null;
      extracted_data?: unknown;
      endedAt?: Date;
    },
  ): Promise<void> {
    await prisma.call.update({
      where: { id: callId },
      data: {
        status: data.status as CallStatus,
        summary: data.summary,
        transcript: data.transcript,
        transcriptMessages: data.transcriptMessages as any,
        duration: data.duration,
        recording: data.recording,
        cost: data.cost,
        extractionResult: data.extracted_data as any,
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

  async updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    completedAt?: Date,
  ): Promise<void> {
    // Resilient fallback: uses updateMany to prevent throwing P2025 errors in production
    await prisma.leadBatch.updateMany({
      where: { id: batchId },
      data: {
        status,
        ...(completedAt && { completedAt }),
      },
    });
  }

  async stopBatchCallsAndLeads(
    batchId: string,
    reason: LeadStopReason,
  ): Promise<{ stoppedCalls: number; stoppedLeads: number }> {
    return prisma.$transaction(async (tx) => {
      // 1. Find all in-flight or scheduled retry calls belonging to this batch
      const activeCalls = await tx.call.findMany({
        where: {
          batchId,
          status: { in: ["SCHEDULED", "CALLING", "PENDING"] },
        },
        select: { id: true, leadId: true },
      });

      const callIds = activeCalls.map((c) => c.id);
      const scheduledOrActiveLeadIds = activeCalls.map((c) => c.leadId);

      // 2. Transition matching calls to STOPPED
      let stoppedCalls = 0;
      if (callIds.length > 0) {
        const callUpdate = await tx.call.updateMany({
          where: { id: { in: callIds } },
          data: {
            status: "STOPPED",
            endedAt: new Date(),
          },
        });
        stoppedCalls = callUpdate.count;
      }

      // 3. Transition uncalled leads (PENDING / CALLING) and leads with stopped retry calls to STOPPED
      const leadUpdate = await tx.lead.updateMany({
        where: {
          batchId,
          OR: [
            { status: { in: ["PENDING", "CALLING"] } },
            ...(scheduledOrActiveLeadIds.length > 0
              ? [{ id: { in: scheduledOrActiveLeadIds } }]
              : []),
          ],
        },
        data: {
          status: "STOPPED",
          stoppedReason: reason,
        },
      });

      return {
        stoppedCalls,
        stoppedLeads: leadUpdate.count,
      };
    });
  }

  async updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    timestamp?: Date,
  ): Promise<void> {
    // Resilient fallback: uses updateMany to prevent throwing P2025 errors in production
    await prisma.campaign.updateMany({
      where: { id: campaignId },
      data: {
        status,
        ...(status === "RUNNING" && timestamp && { startedAt: timestamp }),
        ...(status === "COMPLETED" && timestamp && { completedAt: timestamp }),
        ...(status === "FAILED" && timestamp && { completedAt: timestamp }),
      },
    });
  }

  async incrementTerminalStats(
    campaignId: string,
    batchId: string | null,
    status: "COMPLETED" | "NO_ANSWER" | "BUSY" | "FAILED",
  ): Promise<void> {
    const updateData = {
      calledLeads: { increment: 1 },
      ...(status === "COMPLETED" && { completedLeads: { increment: 1 } }),
      ...(status === "FAILED" && { failedLeads: { increment: 1 } }),
    };

    await prisma.campaign.updateMany({
      where: { id: campaignId },
      data: updateData,
    });

    if (batchId) {
      await prisma.leadBatch.updateMany({
        where: { id: batchId },
        data: updateData,
      });
    }
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
    return batches.map((b) => b.status);
  }

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
    if (!platformAgent) {
      return { platformAgentId: null, dispositions: [] };
    }

    const dispositionMap = new Map<
      string,
      {
        id: string;
        name: string;
        displayName: string;
        slug: string;
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
        dispositionMap.set(dispRel.disposition.id, {
          ...dispRel.disposition,
          objectiveOptions: dispRel.disposition.objectiveOptions as any,
        });
      }
    }

    return {
      platformAgentId: platformAgent.id,
      dispositions: Array.from(dispositionMap.values()),
    };
  }
}

