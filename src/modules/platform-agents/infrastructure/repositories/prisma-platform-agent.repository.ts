import prisma from "../../../../shared/config/database/prisma";
import type {
  Prisma,
  PlatformAgent,
  AgentGender,
  AgentBolnaExtractionBinding,
} from "@prisma/client";
import type {
  AgentExtractionConfig,
  ExtractionConfigUpdateData,
  PlatformAgentRepository,
  PlatformAgentWithCount,
  DispositionObjectiveOption,
} from "../../application/interfaces/platform-agent-repository.interface";
import type {
  RegisterPlatformAgentDTO,
  UpdatePlatformAgentDTO,
  ListPlatformAgentsFilters,
} from "../../application/dto/platform-agent.dto";

export class PrismaPlatformAgentRepository implements PlatformAgentRepository {
  async create(
    data: RegisterPlatformAgentDTO & {
      defaultConfig: unknown;
      systemPrompt: string | null;
    },
  ): Promise<PlatformAgent> {
    const createData: Prisma.PlatformAgentCreateInput = {
      bolnaId: data.bolnaId,
      slug: data.slug,
      name: data.name,
      category: data.category ?? null,
      description: data.description ?? null,
      defaultConfig: data.defaultConfig as Prisma.InputJsonValue,
      systemPrompt: data.systemPrompt ?? null,
      isFeatured: data.isFeatured ?? false,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
      bolnaApiKey: { connect: { id: data.bolnaApiKeyId } },
      extractionConfig:
        data.extractionConfig as unknown as Prisma.InputJsonValue,
      welcomeMessage: data.welcomeMessage ?? undefined,
      requiredVariables:
        data.requiredVariables as unknown as Prisma.InputJsonValue,
      gender: data.gender ?? undefined,
    };

    if (data.industryPackId) {
      createData.industryPack = { connect: { id: data.industryPackId } };
    }

    return prisma.platformAgent.create({
      data: createData,
      include: {
        industryPack: true,
        _count: {
          select: { assistants: true, categories: true },
        },
      },
    });
  }

  async update(
    id: string,
    data: UpdatePlatformAgentDTO & {
      defaultConfig?: unknown;
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
      updateData.defaultConfig = data.defaultConfig as Prisma.InputJsonValue;
    }
    if (data.systemPrompt !== undefined)
      updateData.systemPrompt = data.systemPrompt;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    // [NEW]
    if (data.extractionConfig !== undefined) {
      updateData.extractionConfig =
        data.extractionConfig as unknown as Prisma.InputJsonValue;
    }
    if (data.welcomeMessage !== undefined) {
      updateData.welcomeMessage = data.welcomeMessage;
    }
    if (data.requiredVariables !== undefined) {
      updateData.requiredVariables =
        data.requiredVariables as unknown as Prisma.InputJsonValue;
    }
    if (data.gender !== undefined) {
      updateData.gender = data.gender;
    }

    if (data.bolnaApiKeyId !== undefined) {
      updateData.bolnaApiKey = { connect: { id: data.bolnaApiKeyId } };
    }

    if (data.industryPackId !== undefined) {
      if (data.industryPackId === null) {
        updateData.industryPack = { disconnect: true };
      } else {
        updateData.industryPack = { connect: { id: data.industryPackId } };
      }
    }

    return prisma.platformAgent.update({
      where: { id },
      data: updateData,
      include: {
        industryPack: true,
        _count: {
          select: { assistants: true, categories: true },
        },
      },
    });
  }

  async findById(id: string): Promise<PlatformAgentWithCount | null> {
    return prisma.platformAgent.findUnique({
      where: { id },
      include: {
        industryPack: true,
        _count: {
          select: { assistants: true, categories: true },
        },
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
        _count: {
          select: { assistants: true, categories: true },
        },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.platformAgent.delete({ where: { id } });
  }

  async assignCategoriesToAgent(
    platformAgentId: string,
    categoryIds: string[],
  ): Promise<void> {
    if (!categoryIds.length) return;

    await prisma.platformAgentCategory.createMany({
      data: categoryIds.map((categoryId, idx) => ({
        platformAgentId,
        categoryId,
        sortOrder: idx,
      })),
      skipDuplicates: true,
    });
  }

  async removeCategoryFromAgent(
    platformAgentId: string,
    categoryId: string,
  ): Promise<void> {
    await prisma.platformAgentCategory.deleteMany({
      where: { platformAgentId, categoryId },
    });
  }

  async removeAllCategoriesFromAgent(platformAgentId: string): Promise<void> {
    await prisma.platformAgentCategory.deleteMany({
      where: { platformAgentId },
    });
  }

  async getAgentExtractionConfig(
    platformAgentId: string,
  ): Promise<AgentExtractionConfig | null> {
    const agent = await prisma.platformAgent.findUnique({
      where: { id: platformAgentId },
      select: {
        id: true,
        bolnaId: true,
        bolnaApiKeyId: true,
        categories: {
          orderBy: { sortOrder: "asc" },
          select: {
            categoryId: true,
            sortOrder: true,
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
                model: true,
                dispositions: {
                  orderBy: { sortOrder: "asc" },
                  select: {
                    dispositionId: true,
                    sortOrder: true,
                    disposition: {
                      select: {
                        id: true,
                        name: true,
                        slug: true,
                        // [NEW] for extractionConfig validation
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
        bolnaBindings: true,
      },
    });

    if (!agent) return null;

    return {
      platformAgentId: agent.id,
      bolnaId: agent.bolnaId,
      bolnaApiKeyId: agent.bolnaApiKeyId,
      categories: agent.categories.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.category.name,
        categorySlug: c.category.slug,
        model: c.category.model,
        sortOrder: c.sortOrder,
        dispositions: c.category.dispositions.map((d) => ({
          dispositionId: d.dispositionId,
          dispositionName: d.disposition.name,
          dispositionSlug: d.disposition.slug,
          sortOrder: d.sortOrder,
          isObjective: d.disposition.isObjective,
          isSubjective: d.disposition.isSubjective,
          objectiveOptions: d.disposition.objectiveOptions as
            DispositionObjectiveOption[] | null,
        })),
      })),
      bolnaBindings: agent.bolnaBindings,
    };
  }

  // ── [NEW] Extraction Config (JSON field) ────────────────────────────────

  async updateExtractionConfig(
    platformAgentId: string,
    data: ExtractionConfigUpdateData,
  ): Promise<PlatformAgent> {
    const updateData: Prisma.PlatformAgentUpdateInput = {
      extractionConfig: data.extractionConfig as Prisma.InputJsonValue,
    };

    if (data.welcomeMessage !== undefined) {
      updateData.welcomeMessage = data.welcomeMessage;
    }
    if (data.requiredVariables !== undefined) {
      updateData.requiredVariables =
        data.requiredVariables as Prisma.InputJsonValue;
    }
    if (data.gender !== undefined) {
      updateData.gender = data.gender;
    }

    return prisma.platformAgent.update({
      where: { id: platformAgentId },
      data: updateData,
    });
  }

  // ── Bolna Bindings ──────────────────────────────────────────────────────

  async upsertBolnaBinding(data: {
    platformAgentId: string;
    dispositionId: string;
    bolnaAgentId: string;
    bolnaCategoryId: string;
    bolnaDispositionId: string;
  }): Promise<AgentBolnaExtractionBinding> {
    return prisma.agentBolnaExtractionBinding.upsert({
      where: {
        platformAgentId_dispositionId: {
          platformAgentId: data.platformAgentId,
          dispositionId: data.dispositionId,
        },
      },
      create: {
        platformAgentId: data.platformAgentId,
        dispositionId: data.dispositionId,
        bolnaAgentId: data.bolnaAgentId,
        bolnaCategoryId: data.bolnaCategoryId,
        bolnaDispositionId: data.bolnaDispositionId,
      },
      update: {
        bolnaCategoryId: data.bolnaCategoryId,
        bolnaDispositionId: data.bolnaDispositionId,
        lastSyncedAt: new Date(),
      },
    });
  }

  async deleteBolnaBindings(
    platformAgentId: string,
    dispositionIds: string[],
  ): Promise<void> {
    if (!dispositionIds.length) return;

    await prisma.agentBolnaExtractionBinding.deleteMany({
      where: {
        platformAgentId,
        dispositionId: { in: dispositionIds },
      },
    });
  }

  async deleteAllBolnaBindings(platformAgentId: string): Promise<void> {
    await prisma.agentBolnaExtractionBinding.deleteMany({
      where: { platformAgentId },
    });
  }

  async getBolnaBindings(
    platformAgentId: string,
  ): Promise<AgentBolnaExtractionBinding[]> {
    return prisma.agentBolnaExtractionBinding.findMany({
      where: { platformAgentId },
    });
  }
}
