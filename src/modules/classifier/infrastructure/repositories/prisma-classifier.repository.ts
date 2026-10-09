import prisma from "../../../../shared/config/database/prisma";
import type { ClassifierRepository } from "../../application/interfaces/classifier-repository.interface";
import type {
  CreateClassifierDispositionDTO,
  UpdateClassifierDispositionDTO,
  ListClassifierDispositionsFilters,
} from "../../application/dto/classifier.dto";
import type { ClassifierExtractionStatus } from "@prisma/client";

export class PrismaClassifierRepository implements ClassifierRepository {
  // ── Dispositions ──────────────────────────────────────────────────────────

  async createDisposition(data: CreateClassifierDispositionDTO) {
    return prisma.classifierDisposition.create({
      data: {
        slug: data.slug,
        name: data.name,
        displayName: data.displayName,
        question: data.question,
        questionType: data.questionType,
        objectiveOptions: data.objectiveOptions as any,
        industryPackId: data.industryPackId ?? null,
      },
    });
  }

  async updateDisposition(id: string, data: UpdateClassifierDispositionDTO) {
    return prisma.classifierDisposition.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.displayName !== undefined && {
          displayName: data.displayName,
        }),
        ...(data.question !== undefined && { question: data.question }),
        ...(data.questionType !== undefined && {
          questionType: data.questionType,
        }),
        ...(data.objectiveOptions !== undefined && {
          objectiveOptions: data.objectiveOptions as any,
        }),
        ...(data.industryPackId !== undefined && {
          industryPackId: data.industryPackId,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteDisposition(id: string) {
    await prisma.classifierDisposition.delete({ where: { id } });
  }

  async getDispositionById(id: string) {
    return prisma.classifierDisposition.findUnique({ where: { id } });
  }

  async getDispositionBySlugAndIndustry(
    slug: string,
    industryPackId: string | null,
  ) {
    return prisma.classifierDisposition.findUnique({
      where: {
        slug_industryPackId: {
          slug,
          industryPackId: industryPackId ?? "",
        },
      },
    });
  }

  async listDispositions(filters: ListClassifierDispositionsFilters) {
    const where: any = {};

    if (filters.industryPackId !== undefined) {
      where.industryPackId = filters.industryPackId || null;
    }
    if (filters.questionType) {
      where.questionType = filters.questionType;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { displayName: { contains: filters.search, mode: "insensitive" } },
        { slug: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const [items, total] = await Promise.all([
      prisma.classifierDisposition.findMany({
        where,
        include: {
          industryPack: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.classifierDisposition.count({ where }),
    ]);

    return { items, total };
  }

  // ── Agent Links ───────────────────────────────────────────────────────────

  async assignToAgent(
    platformAgentId: string,
    classifierDispositionIds: string[],
  ) {
    const data = classifierDispositionIds.map((id) => ({
      platformAgentId,
      classifierDispositionId: id,
    }));

    await prisma.platformAgentClassifier.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async removeFromAgent(
    platformAgentId: string,
    classifierDispositionIds: string[],
  ) {
    await prisma.platformAgentClassifier.deleteMany({
      where: {
        platformAgentId,
        classifierDispositionId: { in: classifierDispositionIds },
      },
    });
  }

  async listAgentClassifiers(platformAgentId: string) {
    const links = await prisma.platformAgentClassifier.findMany({
      where: { platformAgentId },
      include: {
        classifierDisposition: {
          include: {
            industryPack: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return links.map((l) => l.classifierDisposition).filter((d) => d.isActive);
  }

  // ── Industry-Aware Resolution ─────────────────────────────────────────────

  async resolveForAgent(
    platformAgentId: string,
    industryPackId: string | null,
  ) {
    const allDispositions = await this.listAgentClassifiers(platformAgentId);

    // Group by slug, prefer industry-specific over general
    const resolved = new Map<string, (typeof allDispositions)[number]>();

    for (const d of allDispositions) {
      const existing = resolved.get(d.slug);

      if (!existing) {
        resolved.set(d.slug, d);
      } else if (
        d.industryPackId === industryPackId &&
        !existing.industryPackId
      ) {
        // Industry-specific variant overrides general
        resolved.set(d.slug, d);
      }
    }

    return Array.from(resolved.values());
  }

  // ── Call Results ──────────────────────────────────────────────────────────

  async createCallResult(data: {
    callId: string;
    tenantId: string;
    campaignId: string;
    batchId: string | null;
    dispositionCount: number;
    transcriptLength: number;
  }) {
    return prisma.classifierCallResult.create({ data });
  }

  async updateCallResult(
    callId: string,
    data: {
      status: ClassifierExtractionStatus;
      rawResponse?: unknown;
      results?: unknown;
      inputTokens?: number;
      outputTokens?: number;
      gatewayCost?: string;
      errorMessage?: string;
      processedAt?: Date;
      retryCount?: number;
    },
  ) {
    await prisma.classifierCallResult.update({
      where: { callId },
      data: {
        status: data.status,
        ...(data.rawResponse !== undefined && {
          rawResponse: data.rawResponse as any,
        }),
        ...(data.results !== undefined && {
          results: data.results as any,
        }),
        ...(data.inputTokens !== undefined && {
          inputTokens: data.inputTokens,
        }),
        ...(data.outputTokens !== undefined && {
          outputTokens: data.outputTokens,
        }),
        ...(data.gatewayCost !== undefined && {
          gatewayCost: data.gatewayCost,
        }),
        ...(data.errorMessage !== undefined && {
          errorMessage: data.errorMessage,
        }),
        ...(data.processedAt !== undefined && {
          processedAt: data.processedAt,
        }),
        ...(data.retryCount !== undefined && {
          retryCount: data.retryCount,
        }),
      },
    });
  }

  async getCallResult(callId: string) {
    return prisma.classifierCallResult.findUnique({ where: { callId } });
  }

  async listCallResults(filters: {
    tenantId: string;
    campaignId?: string;
    batchId?: string;
    status?: ClassifierExtractionStatus;
    page: number;
    limit: number;
  }) {
    const where: any = { tenantId: filters.tenantId };

    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.batchId) where.batchId = filters.batchId;
    if (filters.status) where.status = filters.status;

    const [items, total] = await Promise.all([
      prisma.classifierCallResult.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.classifierCallResult.count({ where }),
    ]);

    return { items, total };
  }

  // ── Call Transcript + Agent Resolution ────────────────────────────────────

  async getCallTranscript(callId: string) {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: {
        transcript: true,
        tenantId: true,
        campaignId: true,
        batchId: true,
        campaign: {
          select: {
            assistant: {
              select: {
                platformAgent: {
                  select: {
                    id: true,
                    industryPackId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!call) return null;

    return {
      transcript: call.transcript,
      tenantId: call.tenantId,
      campaignId: call.campaignId,
      batchId: call.batchId,
      platformAgentId: call.campaign?.assistant?.platformAgent?.id ?? null,
      industryPackId:
        call.campaign?.assistant?.platformAgent?.industryPackId ?? null,
    };
  }
}
