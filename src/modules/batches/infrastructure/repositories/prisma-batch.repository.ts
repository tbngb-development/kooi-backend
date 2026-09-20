import prisma from "../../../../shared/config/database/prisma";
import { type RetryConfig } from "../../../../shared/types/bolna.types";
import type {
  BatchRepository,
  CreateBatchData,
  CreateLeadData,
  BatchStatsResult,
  BatchListItem,
  PendingLeadRow,
} from "../../application/interfaces/batch-repository.interface";
import type { LeadBatchEntityData } from "../../domain/entities/lead-batch.entity";
import {
  type BatchStatus,
  LeadStatus,
  type LeadStopReason,
  type Prisma,
} from "@prisma/client";

export class PrismaBatchRepository implements BatchRepository {
  async list(tenantId: string, campaignId: string): Promise<BatchListItem[]> {
    const batches = await prisma.leadBatch.findMany({
      where: { campaignId, tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { leads: true, calls: true } },
      },
    });

    return batches as unknown as BatchListItem[];
  }

  async findById(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<LeadBatchEntityData | null> {
    const batch = await prisma.leadBatch.findFirst({
      where: { id: batchId, campaignId, tenantId },
    });

    if (!batch) return null;
    return this.toEntityData(batch);
  }

  async findByIdWithCounts(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<BatchListItem | null> {
    const batch = await prisma.leadBatch.findFirst({
      where: { id: batchId, campaignId, tenantId },
      include: {
        _count: { select: { leads: true, calls: true } },
      },
    });

    if (!batch) return null;
    return batch as unknown as BatchListItem;
  }

  async create(data: CreateBatchData): Promise<LeadBatchEntityData> {
    const batch = await prisma.leadBatch.create({
      data: {
        campaignId: data.campaignId,
        tenantId: data.tenantId,
        status: "CREATED",
        fileName: data.fileName,
        totalLeads: data.totalLeads,
        retryConfig:
          (data.retryConfig as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });

    return this.toEntityData(batch);
  }

  /**
   * Mark all never-dialed (PENDING) leads in this batch as STOPPED
   * since the batch has been terminated.
   */
  async markPendingLeadsAsStopped(
    batchId: string,
    reason: LeadStopReason,
  ): Promise<number> {
    const result = await prisma.lead.updateMany({
      where: {
        batchId,
        status: "PENDING",
      },
      data: { status: "STOPPED", stoppedReason: reason },
    });
    return result.count;
  }

  async update(
    batchId: string,
    data: {
      status?: BatchStatus;
      bolnaBatchId?: string;
      originalFileUrl?: string;
      transformedCsvUrl?: string;
      scheduledAt?: Date;
      bolnaScheduledAt?: Date | null;
    },
  ): Promise<LeadBatchEntityData> {
    const batch = await prisma.leadBatch.update({
      where: { id: batchId },
      data,
    });

    return this.toEntityData(batch);
  }

  async delete(batchId: string): Promise<void> {
    await prisma.leadBatch.delete({ where: { id: batchId } });
  }

  async createLeads(leads: CreateLeadData[]): Promise<number> {
    const mappedData = leads.map((l) => ({
      name: l.name,
      phone: l.phone,
      email: l.email,
      company: l.company,
      tenantId: l.tenantId,
      campaignId: l.campaignId,
      batchId: l.batchId,
      metadata: l.metadata as Prisma.InputJsonValue,
      status: LeadStatus.PENDING,
    }));
    const result = await prisma.lead.createMany({
      data: mappedData,
      skipDuplicates: true,
    });

    return result.count;
  }

  async getStats(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<BatchStatsResult> {
    const batch = await prisma.leadBatch.findFirst({
      where: { id: batchId, campaignId, tenantId },
    });

    if (!batch) throw new Error("Batch not found");

    const leadStats = await prisma.lead.groupBy({
      by: ["status"],
      where: { batchId },
      _count: true,
    });

    const callStats = await prisma.call.groupBy({
      by: ["status"],
      where: { batchId },
      _count: true,
    });

    const costAgg = await prisma.call.aggregate({
      where: { batchId, cost: { not: null } },
      _sum: { cost: true },
    });

    return {
      batch: this.toEntityData(batch),
      leads: leadStats.map((s) => ({ status: s.status, _count: s._count })),
      calls: callStats.map((s) => ({ status: s.status, _count: s._count })),
      totalCost: (costAgg._sum.cost ?? 0) / 100,
    };
  }

  async findPendingLeads(batchId: string): Promise<PendingLeadRow[]> {
    const leads = await prisma.lead.findMany({
      where: { batchId, status: "PENDING", doNotCall: false },
    });

    return leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      company: l.company,
      metadata: l.metadata as Record<string, unknown> | null,
    }));
  }

  async reassignLeadsToBatch(
    oldBatchId: string,
    newBatchId: string,
  ): Promise<number> {
    const result = await prisma.lead.updateMany({
      where: { batchId: oldBatchId, status: "PENDING", doNotCall: false },
      data: { batchId: newBatchId },
    });

    return result.count;
  }

  async decrementTotalLeads(batchId: string, count: number): Promise<void> {
    await prisma.leadBatch.update({
      where: { id: batchId },
      data: { totalLeads: { decrement: count } },
    });
  }

  async resetActiveLeadsToPending(batchId: string): Promise<number> {
    const result = await prisma.lead.updateMany({
      where: { batchId, status: "PENDING" },
      data: { status: "PENDING" },
    });

    return result.count;
  }

  async failActiveCalls(batchId: string): Promise<number> {
    const result = await prisma.call.updateMany({
      where: { batchId, status: { in: ["CALLING", "PENDING"] } },
      data: { status: "FAILED", endedAt: new Date() },
    });

    return result.count;
  }

  async getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]> {
    const batches = await prisma.leadBatch.findMany({
      where: { campaignId },
      select: { status: true },
    });

    return batches.map((b) => b.status as BatchStatus);
  }

  async recalculateCampaignStats(campaignId: string): Promise<void> {
    const agg = await prisma.leadBatch.aggregate({
      where: { campaignId },
      _sum: {
        totalLeads: true,
        calledLeads: true,
        completedLeads: true,
        failedLeads: true,
      },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalLeads: agg._sum.totalLeads ?? 0,
        calledLeads: agg._sum.calledLeads ?? 0,
        completedLeads: agg._sum.completedLeads ?? 0,
        failedLeads: agg._sum.failedLeads ?? 0,
      },
    });
  }

  async findExistingPhones(
    campaignId: string,
    phones: string[],
  ): Promise<Set<string>> {
    if (phones.length === 0) return new Set();

    const existing = await prisma.lead.findMany({
      where: { campaignId, phone: { in: phones } },
      select: { phone: true },
    });

    return new Set(existing.map((l) => l.phone));
  }

  // ── Private Mapper ───────────────────────────────────────────────────────

  private toEntityData(batch: {
    id: string;
    bolnaBatchId: string | null;
    tenantId: string;
    campaignId: string;
    status: string;
    fileName: string | null;
    originalFileUrl: string | null;
    transformedCsvUrl: string | null;
    retryConfig: unknown;
    scheduledAt: Date | null;
    bolnaScheduledAt: Date | null;
    totalLeads: number;
    calledLeads: number;
    completedLeads: number;
    failedLeads: number;
    createdAt: Date;
    updatedAt: Date;
  }): LeadBatchEntityData {
    return {
      id: batch.id,
      bolnaBatchId: batch.bolnaBatchId,
      tenantId: batch.tenantId,
      campaignId: batch.campaignId,
      status: batch.status as BatchStatus,
      fileName: batch.fileName,
      originalFileUrl: batch.originalFileUrl,
      transformedCsvUrl: batch.transformedCsvUrl,
      retryConfig: (batch.retryConfig as RetryConfig | null) ?? undefined, // [FIXED]
      scheduledAt: batch.scheduledAt,
      bolnaScheduledAt: batch.bolnaScheduledAt,
      totalLeads: batch.totalLeads,
      calledLeads: batch.calledLeads,
      completedLeads: batch.completedLeads,
      failedLeads: batch.failedLeads,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }
}
