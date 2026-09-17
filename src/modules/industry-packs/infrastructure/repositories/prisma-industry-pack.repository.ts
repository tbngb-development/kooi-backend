import prisma from "../../../../shared/config/database/prisma";
import { Prisma, type IndustryPack } from "@prisma/client";
import type {
  IndustryPackRepository,
  IndustryPackWithCount,
  IndustryPackFull,
} from "../../application/interfaces/industry-pack-repository.interface";
import type {
  CreateIndustryPackDTO,
  UpdateIndustryPackDTO,
  ListIndustryPacksFilters,
} from "../../application/dto/industry-pack.dto";

export class PrismaIndustryPackRepository implements IndustryPackRepository {
  async create(data: CreateIndustryPackDTO): Promise<IndustryPack> {
    return prisma.industryPack.create({
      data: {
        slug: data.slug,
        name: data.name.trim(),
        description: data.description ?? null,
        icon: data.icon ?? null,
        allowedCallingHours:
          (data.allowedCallingHours as Prisma.InputJsonValue) ??
          Prisma.JsonNull,
        requiresConsent: data.requiresConsent ?? false,
      },
    });
  }

  async update(id: string, data: UpdateIndustryPackDTO): Promise<IndustryPack> {
    const updateData: Prisma.IndustryPackUpdateInput = {};

    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.allowedCallingHours !== undefined) {
      updateData.allowedCallingHours =
        data.allowedCallingHours === null
          ? Prisma.JsonNull
          : (data.allowedCallingHours as Prisma.InputJsonValue);
    }
    if (data.requiresConsent !== undefined)
      updateData.requiresConsent = data.requiresConsent;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return prisma.industryPack.update({
      where: { id },
      data: updateData,
    });
  }

  async findById(id: string): Promise<IndustryPackWithCount | null> {
    return prisma.industryPack.findUnique({
      where: { id },
      include: { _count: { select: { platformAgents: true } } },
    });
  }

  async findByIdFull(id: string): Promise<IndustryPackFull | null> {
    return prisma.industryPack.findUnique({
      where: { id },
      include: {
        platformAgents: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            _count: {
              select: { assistants: true, categories: true },
            },
          },
        },
      },
    });
  }

  async findBySlug(slug: string): Promise<IndustryPack | null> {
    return prisma.industryPack.findUnique({ where: { slug } });
  }

  async findByNameInsensitive(name: string): Promise<IndustryPack | null> {
    return prisma.industryPack.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
      },
    });
  }

  async list(
    filters: ListIndustryPacksFilters,
  ): Promise<IndustryPackWithCount[]> {
    return prisma.industryPack.findMany({
      where: {
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      orderBy: [{ createdAt: "asc" }],
      include: { _count: { select: { platformAgents: true } } },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.industryPack.delete({ where: { id } });
  }

  async countAgentsInPack(packId: string): Promise<number> {
    return prisma.platformAgent.count({ where: { industryPackId: packId } });
  }

  async assignAgentToPack(agentId: string, packId: string): Promise<void> {
    await prisma.platformAgent.update({
      where: { id: agentId },
      data: { industryPackId: packId },
    });
  }

  async removeAgentFromPack(agentId: string): Promise<void> {
    await prisma.platformAgent.update({
      where: { id: agentId },
      data: { industryPackId: null },
    });
  }
}
