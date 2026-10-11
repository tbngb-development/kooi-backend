import prisma from "../../../../shared/config/database/prisma";
import { Prisma } from "@prisma/client";
import {
  QuickDialJobEntity,
  type QuickDialJobData,
} from "../../domain/entities/quick-dial.entity";
import type {
  QuickDialRepository,
  CreateQuickDialJobData,
  UpdateQuickDialJobData,
} from "../../application/interfaces/quick-dial-repository.interface";
import type {
  QuickDialJobDTO,
  ListQuickDialJobsFilters,
} from "../../application/dto/quick-dial.dto";

export class PrismaQuickDialRepository implements QuickDialRepository {
  async createJob(data: CreateQuickDialJobData): Promise<QuickDialJobEntity> {
    const record = await prisma.quickDialJob.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        assistantId: data.assistantId,
        leadId: data.leadId ?? null,
        recipientPhone: data.recipientPhone,
        status: data.status,
        metadata: data.metadata
          ? (data.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return new QuickDialJobEntity(record as unknown as QuickDialJobData);
  }

  async updateJob(
    id: string,
    data: UpdateQuickDialJobData,
  ): Promise<QuickDialJobEntity> {
    const record = await prisma.quickDialJob.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.bolnaExecutionId !== undefined && {
          bolnaExecutionId: data.bolnaExecutionId,
        }),
        ...(data.error !== undefined && { error: data.error }),
        ...(data.metadata !== undefined && {
          metadata: data.metadata
            ? (data.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        }),
      },
    });

    return new QuickDialJobEntity(record as unknown as QuickDialJobData);
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<QuickDialJobDTO | null> {
    const record = await prisma.quickDialJob.findFirst({
      where: { id, tenantId },
      include: {
        assistant: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, phone: true } },
        call: {
          select: {
            id: true,
            status: true,
            duration: true,
            recording: true,
            cost: true,
            platformCost: true,
            startedAt: true,
            endedAt: true,
          },
        },
      },
    });

    return record ? (record as unknown as QuickDialJobDTO) : null;
  }

  async findByExecutionId(
    executionId: string,
  ): Promise<QuickDialJobEntity | null> {
    const record = await prisma.quickDialJob.findUnique({
      where: { bolnaExecutionId: executionId },
    });

    return record
      ? new QuickDialJobEntity(record as unknown as QuickDialJobData)
      : null;
  }

  async listJobs(filters: ListQuickDialJobsFilters): Promise<{
    items: QuickDialJobDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const where: Prisma.QuickDialJobWhereInput = {
      tenantId: filters.tenantId,
      ...(filters.assistantId && { assistantId: filters.assistantId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        OR: [
          { recipientPhone: { contains: filters.search } },
          { lead: { name: { contains: filters.search, mode: "insensitive" } } },
        ],
      }),
    };

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.quickDialJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          assistant: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true, phone: true } },
          call: {
            select: {
              id: true,
              status: true,
              duration: true,
              recording: true,
              cost: true,
              platformCost: true,
              startedAt: true,
              endedAt: true,
            },
          },
        },
      }),
      prisma.quickDialJob.count({ where }),
    ]);

    return {
      items: items as unknown as QuickDialJobDTO[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createCallForJob(data: {
    bolnaCallId: string;
    tenantId: string;
    assistantId: string;
    leadId?: string | null;
    quickDialJobId: string;
  }): Promise<{ id: string }> {
    const call = await prisma.call.create({
      data: {
        bolnaCallId: data.bolnaCallId,
        tenantId: data.tenantId,
        assistantId: data.assistantId,
        leadId: data.leadId ?? null,
        quickDialJobId: data.quickDialJobId,
        source: "QUICK_DIAL",
        status: "CALLING",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    return call;
  }
}
