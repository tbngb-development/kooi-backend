import { type Assistant } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import { type RequiredVariable } from "../../../../shared/types/bolna.types";
import type {
  AssistantRepository,
  RegisterAssistantData,
  AssistantWithPlatformAgent,
} from "../../application/interfaces/assistant-repository.interface";
import type { AssistantEntityData } from "../../domain/entities/assistant.entity";

export class PrismaAssistantRepository implements AssistantRepository {
  async list(tenantId: string): Promise<AssistantEntityData[]> {
    const assistants = await prisma.assistant.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { createdAt: "desc" },
    });
    return assistants.map((a) => this.toEntityData(a));
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
      createdAt: assistant.createdAt,
      updatedAt: assistant.updatedAt,
      platformAgent: {
        id: assistant.platformAgent.id,
        bolnaId: assistant.platformAgent.bolnaId,
        name: assistant.platformAgent.name,
        slug: assistant.platformAgent.slug,
        systemPrompt: assistant.platformAgent.systemPrompt,
        welcomeMessage: assistant.platformAgent.welcomeMessage,
        requiredVariables: assistant.platformAgent.requiredVariables as
          RequiredVariable[] | null,
        description: assistant.platformAgent.description,
        category: assistant.platformAgent.category,
        isFeatured: assistant.platformAgent.isFeatured,
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
      },
    });

    return this.toEntityData(assistant);
  }

  async update(
    tenantId: string,
    id: string,
    name: string,
  ): Promise<AssistantEntityData> {
    const assistant = await prisma.assistant.update({
      where: { id, tenantId },
      data: { name },
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
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      isDeleted: a.isDeleted,
      deletedAt: a.deletedAt,
    };
  }
}
