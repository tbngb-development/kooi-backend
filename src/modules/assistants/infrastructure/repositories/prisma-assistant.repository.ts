import { type Assistant } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import { type RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  AssistantRepository,
  RegisterAssistantData,
  AssistantWithPlatformAgent,
  InboundAssistantResult,
} from "../../application/interfaces/assistant-repository.interface";
import type { AssistantEntityData } from "../../domain/entities/assistant.entity";
import type { AssistantVariablesConfig } from "../../domain/types/assistant-variable.types";

export class PrismaAssistantRepository implements AssistantRepository {
  async countActiveCampaigns(
    tenantId: string,
    assistantId: string,
  ): Promise<number> {
    return prisma.campaign.count({
      where: {
        tenantId,
        assistantId,
        status: "RUNNING",
        isDeleted: false,
      },
    });
  }

  async list(
    tenantId: string,
    includeArchived = false,
  ): Promise<AssistantEntityData[]> {
    const [
      assistants,
      callAggregates,
      completedCallAggregates,
      activeCampaignAggregates,
      totalCampaignAggregates,
    ] = await Promise.all([
      prisma.assistant.findMany({
        where: {
          tenantId,
          ...(includeArchived ? {} : { isDeleted: false }),
        },
        include: {
          phoneNumbers: {
            select: {
              id: true,
              phoneNumber: true,
              friendlyName: true,
              provider: true,
              status: true,
              capabilities: true,
            },
          },
          platformAgent: {
            select: {
              id: true,
              bolnaId: true,
              name: true,
              slug: true,
              category: true,
              type: true,
              isActive: true,
              updatedAt: true,
              industryPack: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  icon: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.call.groupBy({
        by: ["assistantId"],
        where: { tenantId, assistantId: { not: null } },
        _count: { _all: true },
        _sum: { billableSeconds: true, duration: true },
      }),
      prisma.call.groupBy({
        by: ["assistantId"],
        where: { tenantId, assistantId: { not: null }, status: "COMPLETED" },
        _count: { _all: true },
      }),
      prisma.campaign.groupBy({
        by: ["assistantId"],
        where: { tenantId, status: "RUNNING", isDeleted: false },
        _count: { _all: true },
      }),
      prisma.campaign.groupBy({
        by: ["assistantId"],
        where: { tenantId, isDeleted: false },
        _count: { _all: true },
      }),
    ]);

    const callMap = new Map(
      callAggregates.map((c) => [c.assistantId, c]),
    );
    const completedMap = new Map(
      completedCallAggregates.map((c) => [c.assistantId, c._count._all]),
    );
    const activeCampMap = new Map(
      activeCampaignAggregates.map((c) => [c.assistantId, c._count._all]),
    );
    const totalCampMap = new Map(
      totalCampaignAggregates.map((c) => [c.assistantId, c._count._all]),
    );

    return assistants.map((a) => {
      const callData = callMap.get(a.id);
      const totalCalls = callData?._count._all ?? 0;
      const completedCalls = completedMap.get(a.id) ?? 0;
      const billableSeconds = callData?._sum.billableSeconds ?? 0;
      const durationSum = callData?._sum.duration ?? 0;
      const avgDurationSeconds =
        totalCalls > 0 ? Math.round(durationSum / totalCalls) : 0;
      const activeCampaignCount = activeCampMap.get(a.id) ?? 0;
      const totalCampaignCount = totalCampMap.get(a.id) ?? 0;

      let syncStatus: "SYNCED" | "DRIFT_DETECTED" | "TEMPLATE_INACTIVE" =
        "SYNCED";
      if (a.platformAgent && a.platformAgent.isActive === false) {
        syncStatus = "TEMPLATE_INACTIVE";
      } else if (
        a.platformAgent &&
        a.platformAgent.updatedAt &&
        a.updatedAt < a.platformAgent.updatedAt
      ) {
        syncStatus = "DRIFT_DETECTED";
      }

      return {
        id: a.id,
        name: a.name,
        tenantId: a.tenantId,
        platformAgentId: a.platformAgentId,
        config: a.config as Record<string, unknown>,
        variables: ((a as any).variables as AssistantVariablesConfig) ?? null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        isDeleted: a.isDeleted,
        deletedAt: a.deletedAt,
        syncStatus,
        phoneNumbers: a.phoneNumbers.map((p) => ({
          id: p.id,
          phoneNumber: p.phoneNumber,
          friendlyName: p.friendlyName,
          provider: String(p.provider),
          status: String(p.status),
          capabilities: String(p.capabilities),
        })),
        metrics: {
          totalCalls,
          completedCalls,
          billableSeconds,
          avgDurationSeconds,
          activeCampaignCount,
          totalCampaignCount,
        },
        platformAgent: a.platformAgent,
      };
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<AssistantEntityData | null> {
    const assistant = await prisma.assistant.findFirst({
      where: {
        id,
        tenantId,
      },
    });
    if (!assistant) return null;
    return this.toEntityData(assistant);
  }

  async findByIdWithPlatformAgent(
    tenantId: string,
    id: string,
  ): Promise<AssistantWithPlatformAgent | null> {
    const assistant = await prisma.assistant.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: { platformAgent: { include: { industryPack: true } } },
    });

    if (!assistant) return null;

    return {
      id: assistant.id,
      name: assistant.name,
      tenantId: assistant.tenantId,
      platformAgentId: assistant.platformAgentId,
      config: assistant.config as Record<string, unknown>,
      variables:
        ((assistant as any).variables as AssistantVariablesConfig) ?? null,
      createdAt: assistant.createdAt,
      updatedAt: assistant.updatedAt,
      platformAgent: {
        id: assistant.platformAgent.id,
        bolnaId: assistant.platformAgent.bolnaId,
        name: assistant.platformAgent.name,
        slug: assistant.platformAgent.slug,
        type: assistant.platformAgent.type,
        systemPrompt: assistant.platformAgent.systemPrompt,
        welcomeMessage: assistant.platformAgent.welcomeMessage,
        requiredVariables: assistant.platformAgent.requiredVariables as
          RequiredVariable[] | null,
        description: assistant.platformAgent.description,
        category: assistant.platformAgent.category,
        isFeatured: assistant.platformAgent.isFeatured,
        isActive: assistant.platformAgent.isActive,
        industryPack: assistant.platformAgent.industryPack
          ? {
              id: assistant.platformAgent.industryPack.id,
              name: assistant.platformAgent.industryPack.name,
              slug: assistant.platformAgent.industryPack.slug,
            }
          : null,
      },
    };
  }

  async findByPlatformAgentId(
    tenantId: string | null,
    platformAgentId: string,
  ): Promise<AssistantEntityData | null> {
    const assistant = await prisma.assistant.findFirst({
      where: {
        platformAgentId,
        isDeleted: false,
        ...(tenantId && { tenantId }),
      },
    });

    if (!assistant) return null;
    return this.toEntityData(assistant);
  }

  async create(
    tenantId: string,
    data: RegisterAssistantData,
  ): Promise<AssistantEntityData> {
    const assistant = await prisma.assistant.create({
      data: {
        platformAgentId: data.platformAgentId,
        name: data.name,
        tenantId,
        config: data.config as any,
        variables: (data.variables as any) ?? undefined,
      },
    });

    return this.toEntityData(assistant);
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; variables?: any },
  ): Promise<AssistantEntityData> {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.variables !== undefined)
      updateData.variables = data.variables as any;

    const assistant = await prisma.assistant.update({
      where: { id, tenantId },
      data: updateData,
    });

    return this.toEntityData(assistant);
  }

  async updateConfig(
    tenantId: string,
    id: string,
    config: any,
  ): Promise<AssistantEntityData> {
    const assistant = await prisma.assistant.update({
      where: { id, tenantId },
      data: { config },
    });

    return this.toEntityData(assistant);
  }

  async findByTenantId(tenantId: string) {
    const assistants = await prisma.assistant.findMany({
      where: { tenantId, isDeleted: false },
      select: {
        id: true,
        name: true,
        platformAgentId: true,
        tenantId: true,
        config: true,
      },
    });

    return assistants.map((a) => ({
      ...a,
      config: a.config as Record<string, unknown>,
    }));
  }

  async repointPlatformAgent(
    assistantId: string,
    newPlatformAgentId: string,
  ): Promise<void> {
    await prisma.assistant.update({
      where: { id: assistantId },
      data: { platformAgentId: newPlatformAgentId },
    });
  }

  async findInboundByBolnaAgentId(
    agentId: string,
  ): Promise<InboundAssistantResult | null> {
    const assistant = await prisma.assistant.findFirst({
      where: {
        isDeleted: false,
        platformAgent: {
          bolnaId: agentId,
          type: { in: ["INBOUND", "BOTH"] },
        },
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        variables: true,
        platformAgent: {
          select: {
            id: true,
            name: true,
            type: true,
            welcomeMessage: true,
          },
        },
      },
    });

    if (!assistant) return null;

    return {
      id: assistant.id,
      name: assistant.name,
      tenantId: assistant.tenantId,
      variables: assistant.variables,
      platformAgent: {
        id: assistant.platformAgent.id,
        name: assistant.platformAgent.name,
        type: assistant.platformAgent.type,
        welcomeMessage: assistant.platformAgent.welcomeMessage,
      },
    };
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await prisma.assistant.update({
      where: { id, tenantId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async restore(tenantId: string, id: string): Promise<void> {
    await prisma.assistant.update({
      where: { id, tenantId },
      data: { isDeleted: false, deletedAt: null },
    });
  }

  private toEntityData(a: Assistant): AssistantEntityData {
    return {
      id: a.id,
      name: a.name,
      tenantId: a.tenantId,
      platformAgentId: a.platformAgentId,
      config: a.config as Record<string, unknown>,
      variables: ((a as any).variables as AssistantVariablesConfig) ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      isDeleted: a.isDeleted,
      deletedAt: a.deletedAt,
    };
  }
}
