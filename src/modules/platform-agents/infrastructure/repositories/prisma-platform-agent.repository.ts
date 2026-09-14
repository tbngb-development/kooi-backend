import prisma from "../../../../shared/config/database/prisma";
import { Prisma, type PlatformAgent } from "@prisma/client";
import type {
  PlatformAgentRepository,
  PlatformAgentWithCount,
} from "../../application/interfaces/platform-agent-repository.interface";
import type {
  RegisterPlatformAgentDTO,
  UpdatePlatformAgentDTO,
  ListPlatformAgentsFilters,
} from "../../application/dto/platform-agent.dto";

export class PrismaPlatformAgentRepository implements PlatformAgentRepository {
  async create(
    data: RegisterPlatformAgentDTO & {
      defaultConfig: any;
      systemPrompt: string | null;
    },
  ): Promise<PlatformAgent> {
    const createData: Prisma.PlatformAgentCreateInput = {
      bolnaId: data.bolnaId,
      slug: data.slug,
      name: data.name,
      category: data.category ?? null,
      description: data.description ?? null,
      defaultConfig: (data.defaultConfig as any) ?? Prisma.JsonNull,
      systemPrompt: data.systemPrompt ?? null,
      isFeatured: data.isFeatured ?? false,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    };

    if (data.industryPackId) {
      createData.industryPack = { connect: { id: data.industryPackId } };
    } else if (data.industry) {
      // Auto-connect or create the parent IndustryPack for this industry
      createData.industryPack = {
        connectOrCreate: {
          where: { industry: data.industry },
          create: {
            slug: data.industry.toLowerCase().replace(/_/g, "-"),
            name: data.industry.replace(/_/g, " "),
            industry: data.industry,
          },
        },
      };
    }

    return prisma.platformAgent.create({
      data: createData,
      include: {
        industryPack: true,
        _count: { select: { assistants: true, extractionCategories: true } },
      },
    });
  }

  async update(
    id: string,
    data: UpdatePlatformAgentDTO & {
      defaultConfig?: any;
      systemPrompt?: string | null;
    },
  ): Promise<PlatformAgent> {
    const updateData: Prisma.PlatformAgentUpdateInput = {};

    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.defaultConfig !== undefined) {
      updateData.defaultConfig = (data.defaultConfig as any) ?? Prisma.JsonNull;
    }
    if (data.systemPrompt !== undefined)
      updateData.systemPrompt = data.systemPrompt;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    if (data.industryPackId !== undefined) {
      if (data.industryPackId === null) {
        updateData.industryPack = { disconnect: true };
      } else {
        updateData.industryPack = { connect: { id: data.industryPackId } };
      }
    } else if (data.industry) {
      updateData.industryPack = {
        connectOrCreate: {
          where: { industry: data.industry },
          create: {
            slug: data.industry.toLowerCase().replace(/_/g, "-"),
            name: data.industry.replace(/_/g, " "),
            industry: data.industry,
          },
        },
      };
    }

    return prisma.platformAgent.update({
      where: { id },
      data: updateData,
      include: {
        industryPack: true,
        _count: { select: { assistants: true, extractionCategories: true } },
      },
    });
  }

  async findById(id: string): Promise<PlatformAgentWithCount | null> {
    return prisma.platformAgent.findUnique({
      where: { id },
      include: {
        industryPack: true,
        _count: { select: { assistants: true, extractionCategories: true } },
      },
    });
  }

  async findBySlug(slug: string): Promise<PlatformAgent | null> {
    return prisma.platformAgent.findUnique({
      where: { slug },
      include: {
        industryPack: true,
      },
    });
  }

  async findByBolnaId(bolnaId: string): Promise<PlatformAgent | null> {
    return prisma.platformAgent.findUnique({
      where: { bolnaId },
      include: {
        industryPack: true,
      },
    });
  }

  async list(
    filters: ListPlatformAgentsFilters,
  ): Promise<PlatformAgentWithCount[]> {
    return prisma.platformAgent.findMany({
      where: {
        ...(filters.industry !== undefined && {
          industryPack: {
            industry: filters.industry,
          },
        }),
        ...(filters.industryPackId !== undefined && {
          industryPackId: filters.industryPackId,
        }),
        ...(filters.isActive !== undefined && {
          isActive: filters.isActive,
        }),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        industryPack: true,
        _count: { select: { assistants: true, extractionCategories: true } },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.platformAgent.delete({ where: { id } });
  }
}
