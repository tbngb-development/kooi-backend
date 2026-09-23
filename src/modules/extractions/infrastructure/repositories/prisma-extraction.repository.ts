import prisma from "../../../../shared/config/database/prisma";
import { Prisma } from "@prisma/client";
import type { ExtractionCategory, ExtractionDisposition } from "@prisma/client";
import type {
  ExtractionRepository,
  CategoryWithCount,
  CategoryWithRelations,
  DispositionWithRelations,
} from "../../application/interfaces/extraction-repository.interface";
import type {
  CreateCategoryDTO,
  UpdateCategoryDTO,
  ListCategoriesFilters,
  CreateDispositionDTO,
  UpdateDispositionDTO,
  ListDispositionsFilters,
} from "../../application/dto/extraction.dto";
import { generateSlug } from "../../domain/rules/slug-generator";

export class PrismaExtractionRepository implements ExtractionRepository {
  // ───────────────────────────────────────────────────────────────────────────
  // CATEGORIES: CRUD
  // ───────────────────────────────────────────────────────────────────────────

  async createCategory(data: CreateCategoryDTO): Promise<ExtractionCategory> {
    const slug = generateSlug(data.name);

    return prisma.extractionCategory.create({
      data: {
        slug,
        name: data.name.trim(),
        model: data.model ?? "gpt-4.1-mini",
        description: data.description ?? null,
        // M2M: industries (optional at creation)
        ...(data.industryPackIds?.length && {
          industries: {
            create: data.industryPackIds.map((id) => ({
              industryPackId: id,
            })),
          },
        }),
        // M2M: dispositions (optional at creation)
        ...(data.dispositionIds?.length && {
          dispositions: {
            create: data.dispositionIds.map((id, idx) => ({
              dispositionId: id,
              sortOrder: idx,
            })),
          },
        }),
      },
    });
  }

  async updateCategory(
    id: string,
    data: UpdateCategoryDTO,
  ): Promise<ExtractionCategory> {
    const updateData: Prisma.ExtractionCategoryUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
      updateData.slug = generateSlug(data.name);
    }
    if (data.model !== undefined) updateData.model = data.model;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return prisma.extractionCategory.update({
      where: { id },
      data: updateData,
    });
  }

  async findCategoryById(id: string): Promise<CategoryWithCount | null> {
    return prisma.extractionCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            dispositions: true,
            industries: true,
            platformAgents: true,
          },
        },
      },
    });
  }

  async findCategoryByIdWithRelations(
    id: string,
  ): Promise<CategoryWithRelations | null> {
    return prisma.extractionCategory.findUnique({
      where: { id },
      include: {
        industries: { include: { industryPack: true } },
        dispositions: {
          include: { disposition: true },
          orderBy: { sortOrder: "asc" },
        },
        platformAgents: { include: { platformAgent: true } },
      },
    });
  }

  async findCategoryBySlug(slug: string): Promise<ExtractionCategory | null> {
    return prisma.extractionCategory.findUnique({ where: { slug } });
  }

  async findCategoryByNameInsensitive(
    name: string,
  ): Promise<ExtractionCategory | null> {
    return prisma.extractionCategory.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
      },
    });
  }

  async listCategories(
    filters: ListCategoriesFilters,
  ): Promise<CategoryWithCount[]> {
    const where: Prisma.ExtractionCategoryWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.industryPackId !== undefined) {
      where.industries = {
        some: { industryPackId: filters.industryPackId },
      };
    }
    if (filters.platformAgentId !== undefined) {
      where.platformAgents = {
        some: { platformAgentId: filters.platformAgentId },
      };
    }

    return prisma.extractionCategory.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        _count: {
          select: {
            dispositions: true,
            industries: true,
            platformAgents: true,
          },
        },
      },
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await prisma.extractionCategory.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CATEGORIES: M2M INDUSTRIES
  // ───────────────────────────────────────────────────────────────────────────

  async attachIndustriesToCategory(
    categoryId: string,
    industryPackIds: string[],
  ): Promise<void> {
    if (!industryPackIds.length) return;

    await prisma.extractionCategoryIndustry.createMany({
      data: industryPackIds.map((industryPackId) => ({
        categoryId,
        industryPackId,
      })),
      skipDuplicates: true,
    });
  }

  async detachIndustryFromCategory(
    categoryId: string,
    industryPackId: string,
  ): Promise<void> {
    await prisma.extractionCategoryIndustry.deleteMany({
      where: { categoryId, industryPackId },
    });
  }

  async detachAllIndustriesFromCategory(categoryId: string): Promise<void> {
    await prisma.extractionCategoryIndustry.deleteMany({
      where: { categoryId },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CATEGORIES: M2M DISPOSITIONS
  // ───────────────────────────────────────────────────────────────────────────

  async attachDispositionsToCategory(
    categoryId: string,
    dispositionIds: string[],
  ): Promise<void> {
    if (!dispositionIds.length) return;

    await prisma.extractionCategoryDisposition.createMany({
      data: dispositionIds.map((dispositionId, idx) => ({
        categoryId,
        dispositionId,
        sortOrder: idx,
      })),
      skipDuplicates: true,
    });
  }

  async detachDispositionFromCategory(
    categoryId: string,
    dispositionId: string,
  ): Promise<void> {
    await prisma.extractionCategoryDisposition.deleteMany({
      where: { categoryId, dispositionId },
    });
  }

  async detachAllDispositionsFromCategory(categoryId: string): Promise<void> {
    await prisma.extractionCategoryDisposition.deleteMany({
      where: { categoryId },
    });
  }

  async countDispositionsInCategory(categoryId: string): Promise<number> {
    return prisma.extractionCategoryDisposition.count({
      where: { categoryId },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CATEGORIES: GUARDS
  // ───────────────────────────────────────────────────────────────────────────

  async isCategoryAttachedToAgent(categoryId: string): Promise<boolean> {
    const count = await prisma.platformAgentCategory.count({
      where: { categoryId },
    });
    return count > 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISPOSITIONS: CRUD
  // ───────────────────────────────────────────────────────────────────────────

  async createDisposition(
    data: CreateDispositionDTO,
  ): Promise<ExtractionDisposition> {
    const slug = generateSlug(data.name);

    return prisma.extractionDisposition.create({
      data: {
        slug,
        name: data.name.trim(),
        question: data.question,
        systemPrompt: data.systemPrompt ?? null,
        model: data.model ?? "gpt-4.1-mini",
        isSubjective: data.isSubjective ?? false,
        isObjective: data.isObjective ?? false,
        subjectiveType: data.subjectiveType ?? "text",
        subjectiveTypeConfig:
          (data.subjectiveTypeConfig as Prisma.InputJsonValue) ??
          Prisma.JsonNull,
        objectiveOptions:
          (data.objectiveOptions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        description: data.description ?? null,
        showInOverview: data.showInOverview ?? true,
        showInInsights: data.showInInsights ?? false,
        // M2M: industries (optional at creation)
        ...(data.industryPackIds?.length && {
          industries: {
            create: data.industryPackIds.map((id) => ({
              industryPackId: id,
            })),
          },
        }),
      },
    });
  }

  async updateDisposition(
    id: string,
    data: UpdateDispositionDTO,
  ): Promise<ExtractionDisposition> {
    const updateData: Prisma.ExtractionDispositionUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
      updateData.slug = generateSlug(data.name);
    }
    if (data.question !== undefined) updateData.question = data.question;
    if (data.systemPrompt !== undefined)
      updateData.systemPrompt = data.systemPrompt;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.isSubjective !== undefined)
      updateData.isSubjective = data.isSubjective;
    if (data.isObjective !== undefined)
      updateData.isObjective = data.isObjective;
    if (data.subjectiveType !== undefined)
      updateData.subjectiveType = data.subjectiveType;
    if (data.subjectiveTypeConfig !== undefined)
      updateData.subjectiveTypeConfig =
        (data.subjectiveTypeConfig as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (data.objectiveOptions !== undefined)
      updateData.objectiveOptions =
        (data.objectiveOptions as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.showInOverview !== undefined)
      updateData.showInOverview = data.showInOverview;
    if (data.showInInsights !== undefined)
      updateData.showInInsights = data.showInInsights;

    return prisma.extractionDisposition.update({
      where: { id },
      data: updateData,
    });
  }

  async findDispositionById(id: string): Promise<ExtractionDisposition | null> {
    return prisma.extractionDisposition.findUnique({ where: { id } });
  }

  async findDispositionByIdWithRelations(
    id: string,
  ): Promise<DispositionWithRelations | null> {
    return prisma.extractionDisposition.findUnique({
      where: { id },
      include: {
        industries: { include: { industryPack: true } },
        categories: {
          include: { category: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  async findDispositionBySlug(
    slug: string,
  ): Promise<ExtractionDisposition | null> {
    return prisma.extractionDisposition.findUnique({ where: { slug } });
  }

  async findDispositionByNameInsensitive(
    name: string,
  ): Promise<ExtractionDisposition | null> {
    return prisma.extractionDisposition.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
      },
    });
  }

  async listDispositions(
    filters: ListDispositionsFilters,
  ): Promise<ExtractionDisposition[]> {
    const where: Prisma.ExtractionDispositionWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.industryPackId !== undefined) {
      where.industries = {
        some: { industryPackId: filters.industryPackId },
      };
    }

    // Handle category and/or platform agent filtering through the category M2M chain
    if (
      filters.categoryId !== undefined &&
      filters.platformAgentId !== undefined
    ) {
      where.categories = {
        some: {
          categoryId: filters.categoryId,
          category: {
            platformAgents: {
              some: { platformAgentId: filters.platformAgentId },
            },
          },
        },
      };
    } else if (filters.categoryId !== undefined) {
      where.categories = {
        some: { categoryId: filters.categoryId },
      };
    } else if (filters.platformAgentId !== undefined) {
      where.categories = {
        some: {
          category: {
            platformAgents: {
              some: { platformAgentId: filters.platformAgentId },
            },
          },
        },
      };
    }

    return prisma.extractionDisposition.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async deleteDisposition(id: string): Promise<void> {
    await prisma.extractionDisposition.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISPOSITIONS: M2M INDUSTRIES
  // ───────────────────────────────────────────────────────────────────────────

  async attachIndustriesToDisposition(
    dispositionId: string,
    industryPackIds: string[],
  ): Promise<void> {
    if (!industryPackIds.length) return;

    await prisma.extractionDispositionIndustry.createMany({
      data: industryPackIds.map((industryPackId) => ({
        dispositionId,
        industryPackId,
      })),
      skipDuplicates: true,
    });
  }

  async detachIndustryFromDisposition(
    dispositionId: string,
    industryPackId: string,
  ): Promise<void> {
    await prisma.extractionDispositionIndustry.deleteMany({
      where: { dispositionId, industryPackId },
    });
  }

  async detachAllIndustriesFromDisposition(
    dispositionId: string,
  ): Promise<void> {
    await prisma.extractionDispositionIndustry.deleteMany({
      where: { dispositionId },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISPOSITIONS: GUARDS
  // ───────────────────────────────────────────────────────────────────────────

  async isDispositionAttachedToAgent(dispositionId: string): Promise<boolean> {
    const count = await prisma.platformAgentCategory.count({
      where: {
        category: {
          dispositions: {
            some: { dispositionId },
          },
        },
      },
    });
    return count > 0;
  }
}
