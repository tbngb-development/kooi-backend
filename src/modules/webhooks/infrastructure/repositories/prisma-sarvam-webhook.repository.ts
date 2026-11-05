import prisma from "../../../../shared/config/database/prisma";
import type { Prisma, PrismaClient, CallStatus, LeadStatus } from "@prisma/client";
import type {
  ISarvamWebhookRepository,
  AggregateCallCandidate,
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
    campaignId: string,
  ): Promise<AggregateCallCandidate | null> {
    const call = await this.client.call.findFirst({
      where: {
        leadId,
        campaignId,
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
    };
  }
}

