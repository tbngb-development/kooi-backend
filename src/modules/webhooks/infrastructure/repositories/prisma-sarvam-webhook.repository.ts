import prisma from "../../../../shared/config/database/prisma";
import type { Prisma, PrismaClient, CallStatus, LeadStatus, BatchStatus, CampaignStatus } from "@prisma/client";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
  CampaignGoalSnapshot,
  CreateAggregateCallData,
  UpdateAggregateCallData,
} from "../../application/interfaces/sarvam-webhook-repository.interface";

const aggregateCallSelect = {
  id: true,
  tenantId: true,
  campaignId: true,
  leadId: true,
  batchId: true,
  provider: true,
  status: true,
  sarvamAttemptId: true,
  sarvamInteractionId: true,
  sarvamUserIdentifier: true,
  duration: true,
  recording: true,
  transcript: true,
  transcriptMessages: true,
  callHistory: true,
  extractionResult: true,
  startedAt: true,
  endedAt: true,
  agentNumber: true,
  cost: true,
  platformCost: true,
  billableSeconds: true,
  planVersionId: true,
  appliedRate: true,
  appliedMinSec: true,
  appliedIncrementSec: true,
  chargedAmount: true,
  goalPassed: true,
};

type DbCallRow = {
  id: string;
  tenantId: string;
  campaignId: string | null;
  leadId: string;
  batchId: string | null;
  provider: any;
  status: CallStatus;
  sarvamAttemptId: string | null;
  sarvamInteractionId: string | null;
  sarvamUserIdentifier: string | null;
  duration: number | null;
  recording: string | null;
  transcript: string | null;
  transcriptMessages: unknown;
  callHistory: unknown;
  extractionResult: unknown;
  startedAt: Date | null;
  endedAt: Date | null;
  agentNumber: string | null;
  cost: number | null;
  platformCost: number | null;
  billableSeconds: number | null;
  planVersionId: string | null;
  appliedRate: number | null;
  appliedMinSec: number | null;
  appliedIncrementSec: number | null;
  chargedAmount: number | null;
  goalPassed: boolean;
};

export class PrismaSarvamWebhookRepository implements ISarvamWebhookRepository {
  constructor(
    private readonly client: PrismaClient | Prisma.TransactionClient = prisma,
  ) {}

  async executeInAdvisoryLock<T>(
    lockKey: string,
    operation: (txRepo: ISarvamWebhookRepository) => Promise<T>,
  ): Promise<T> {
    if ("$transaction" in this.client) {
      return (this.client as PrismaClient).$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const txRepo = new PrismaSarvamWebhookRepository(tx);
        return operation(txRepo);
      });
    } else {
      await (this.client as Prisma.TransactionClient).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return operation(this);
    }
  }

  async findAggregateCall(
    leadId: string,
    batchId: string,
  ): Promise<AggregateCallCandidate | null> {
    const call = await this.client.call.findFirst({
      where: {
        leadId,
        batchId,
        provider: "SARVAM",
      },
      orderBy: { createdAt: "desc" },
      select: aggregateCallSelect,
    });

    return call ? this.toCandidate(call as DbCallRow) : null;
  }

  async createAggregateCall(
    data: CreateAggregateCallData,
  ): Promise<AggregateCallCandidate> {
    const call = await this.client.call.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        batchId: data.batchId,
        leadId: data.leadId,
        sarvamAgentId: data.sarvamAgentId,
        provider: data.provider,
        status: data.status,
        type: "OUTBOUND",
        source: "CAMPAIGN",
        sarvamAttemptId: data.sarvamAttemptId,
        sarvamInteractionId: data.sarvamInteractionId ?? null,
        sarvamUserIdentifier: data.sarvamUserIdentifier,
        callHistory: data.callHistory as any,
        agentNumber: data.agentNumber ?? null,
        duration: data.duration ?? null,
        startedAt: data.startedAt ?? null,
        endedAt: data.endedAt ?? null,
        transcript: data.transcript ?? null,
        transcriptMessages: (data.transcriptMessages as any) ?? null,
        extractionResult: (data.extractionResult as any) ?? null,
        cost: data.cost ?? null,
        platformCost: data.platformCost ?? null,
        billableSeconds: data.billableSeconds ?? null,
        planVersionId: data.planVersionId ?? null,
        appliedRate: data.appliedRate ?? null,
        appliedMinSec: data.appliedMinSec ?? null,
        appliedIncrementSec: data.appliedIncrementSec ?? null,
        chargedAmount: data.chargedAmount ?? null,
        goalPassed: data.goalPassed ?? false,
      },
      select: aggregateCallSelect,
    });

    return this.toCandidate(call as DbCallRow);
  }

  async updateAggregateCall(
    callId: string,
    data: UpdateAggregateCallData,
  ): Promise<void> {
    await this.client.call.update({
      where: { id: callId },
      data: {
        status: data.status,
        sarvamAttemptId: data.sarvamAttemptId,
        sarvamInteractionId: data.sarvamInteractionId ?? undefined,
        sarvamUserIdentifier: data.sarvamUserIdentifier,
        callHistory: data.callHistory as any,
        ...(data.agentNumber !== undefined
          ? { agentNumber: data.agentNumber }
          : {}),
        ...(data.duration !== undefined && data.duration !== null
          ? { duration: data.duration }
          : {}),
        ...(data.startedAt ? { startedAt: data.startedAt } : {}),
        ...(data.endedAt ? { endedAt: data.endedAt } : {}),
        ...(data.transcript ? { transcript: data.transcript } : {}),
        ...(data.transcriptMessages
          ? { transcriptMessages: data.transcriptMessages as any }
          : {}),
        ...(data.extractionResult
          ? { extractionResult: data.extractionResult as any }
          : {}),
        ...(data.cost !== undefined ? { cost: data.cost } : {}),
        ...(data.platformCost !== undefined ? { platformCost: data.platformCost } : {}),
        ...(data.billableSeconds !== undefined ? { billableSeconds: data.billableSeconds } : {}),
        ...(data.planVersionId !== undefined ? { planVersionId: data.planVersionId } : {}),
        ...(data.appliedRate !== undefined ? { appliedRate: data.appliedRate } : {}),
        ...(data.appliedMinSec !== undefined ? { appliedMinSec: data.appliedMinSec } : {}),
        ...(data.appliedIncrementSec !== undefined ? { appliedIncrementSec: data.appliedIncrementSec } : {}),
        ...(data.chargedAmount !== undefined ? { chargedAmount: data.chargedAmount } : {}),
        ...(data.goalPassed !== undefined ? { goalPassed: data.goalPassed } : {}),
      },
    });
  }

  async updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
    await this.client.lead.update({
      where: { id: leadId },
      data: { status },
    });
  }

  async findSarvamAgentForTenant(
    agentId: string,
    tenantId: string,
  ): Promise<{ id: string; outputVariables: unknown } | null> {
    return this.client.sarvamAgent.findFirst({
      where: {
        id: agentId,
        apiKey: {
          tenantId,
        },
      },
      select: {
        id: true,
        outputVariables: true,
      },
    });
  }

  async getCallAnalysis(
    callId: string,
  ): Promise<{ id: string; outputVariables: unknown } | null> {
    return this.client.callAnalysis.findUnique({
      where: { callId },
      select: {
        id: true,
        outputVariables: true,
      },
    });
  }

  async upsertCallAnalysisOutputVariables(
    callId: string,
    tenantId: string,
    outputVariables: Array<{ key: string; value: unknown }>,
  ): Promise<void> {
    await this.client.callAnalysis.upsert({
      where: { callId },
      create: {
        callId,
        tenantId,
        outputVariables: outputVariables as Prisma.InputJsonValue,
      },
      update: {
        outputVariables: outputVariables as Prisma.InputJsonValue,
      },
    });
  }

  async findCampaignGoals(campaignId: string): Promise<CampaignGoalSnapshot[]> {
    return this.client.campaignGoal.findMany({
      where: { campaignId },
      select: {
        id: true,
        campaignId: true,
        outputVariableName: true,
        expectedValue: true,
        displayName: true,
      },
    });
  }

  async upsertCallGoalResults(
    callId: string,
    matchedGoals: Array<{ campaignGoalId: string; attemptId: string }>,
  ): Promise<void> {
    for (const match of matchedGoals) {
      await this.client.callGoalResult.upsert({
        where: {
          callId_campaignGoalId: {
            callId,
            campaignGoalId: match.campaignGoalId,
          },
        },
        create: {
          callId,
          campaignGoalId: match.campaignGoalId,
          attemptId: match.attemptId,
        },
        update: {
          attemptId: match.attemptId,
        },
      });
    }
  }

  async markCallGoalPassed(callId: string): Promise<void> {
    await this.client.call.update({
      where: { id: callId },
      data: { goalPassed: true },
    });
  }

  async countActiveLeadsInBatch(batchId: string): Promise<number> {
    return this.client.lead.count({
      where: {
        batchId,
        status: { in: ["PENDING", "CALLING"] },
      },
    });
  }

  async countActiveCallsInBatch(batchId: string): Promise<number> {
    return this.client.call.count({
      where: {
        batchId,
        status: { in: ["SCHEDULED", "CALLING", "PENDING"] },
        isDeleted: false,
      },
    });
  }

  async getBatchWithRetryConfig(
    batchId: string,
  ): Promise<{ id: string; status: BatchStatus; retryConfig: unknown; campaignId: string } | null> {
    const batch = await this.client.leadBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        status: true,
        retryConfig: true,
        campaignId: true,
      },
    });
    return batch;
  }

  async getCallsInBatch(
    batchId: string,
  ): Promise<Array<{ id: string; status: CallStatus; callHistory: unknown }>> {
    const calls = await this.client.call.findMany({
      where: {
        batchId,
        isDeleted: false,
      },
      select: {
        id: true,
        status: true,
        callHistory: true,
      },
    });
    return calls;
  }

  async updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    completedAt?: Date,
  ): Promise<void> {
    await this.client.leadBatch.update({
      where: { id: batchId },
      data: {
        status,
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
    });
  }

  async getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]> {
    const batches = await this.client.leadBatch.findMany({
      where: { campaignId, isDeleted: false },
      select: { status: true },
    });
    return batches.map((b) => b.status);
  }

  async updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    completedAt?: Date,
  ): Promise<void> {
    await this.client.campaign.update({
      where: { id: campaignId },
      data: {
        status,
        ...(completedAt !== undefined ? { completedAt } : {}),
      },
    });
  }

  async recalculateCampaignStats(campaignId: string): Promise<void> {
    const batches = await this.client.leadBatch.findMany({
      where: { campaignId, isDeleted: false },
      select: { status: true },
    });

    const statuses = batches.map((b) => b.status);

    const hasActiveBatches = statuses.some(
      (s) => s === "RUNNING" || s === "SCHEDULED" || s === "PROCESSING",
    );

    let campaignStatusUpdate: {
      status?: "COMPLETED" | "FAILED";
      completedAt?: Date;
    } = {};

    if (statuses.length > 0 && !hasActiveBatches) {
      const allTerminal = statuses.every(
        (s) => s === "COMPLETED" || s === "STOPPED" || s === "FAILED",
      );

      if (allTerminal) {
        const allFailed = statuses.every((s) => s === "FAILED");
        campaignStatusUpdate = {
          status: allFailed ? "FAILED" : "COMPLETED",
          completedAt: new Date(),
        };
      }
    }

    if (Object.keys(campaignStatusUpdate).length > 0) {
      await this.client.campaign.update({
        where: { id: campaignId },
        data: campaignStatusUpdate,
      });
    }
  }

  private toCandidate(row: DbCallRow): AggregateCallCandidate {
    return {
      id: row.id,
      tenantId: row.tenantId,
      campaignId: row.campaignId,
      leadId: row.leadId,
      batchId: row.batchId,
      provider: row.provider,
      status: row.status,
      sarvamAttemptId: row.sarvamAttemptId,
      sarvamInteractionId: row.sarvamInteractionId,
      sarvamUserIdentifier: row.sarvamUserIdentifier,
      duration: row.duration,
      recording: row.recording,
      transcript: row.transcript,
      transcriptMessages: row.transcriptMessages,
      callHistory: row.callHistory,
      extractionResult: row.extractionResult,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      agentNumber: row.agentNumber,
      cost: row.cost,
      platformCost: row.platformCost,
      billableSeconds: row.billableSeconds,
      planVersionId: row.planVersionId,
      appliedRate: row.appliedRate,
      appliedMinSec: row.appliedMinSec,
      appliedIncrementSec: row.appliedIncrementSec,
      chargedAmount: row.chargedAmount,
      goalPassed: row.goalPassed,
    };
  }
}

