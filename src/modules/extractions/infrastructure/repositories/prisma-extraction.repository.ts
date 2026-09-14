import prisma from "../../../../shared/config/database/prisma";
import {
  Prisma,
  type ExtractionCategory,
  type ExtractionDisposition,
  type Industry,
} from "@prisma/client";
import type {
  ExtractionRepository,
  CategoryWithCount,
} from "../../application/interfaces/extraction-repository.interface";
import type {
  CreateCategoryDTO,
  UpdateCategoryDTO,
  ListCategoriesFilters,
  CreateDispositionDTO,
  UpdateDispositionDTO,
  ListDispositionsFilters,
} from "../../application/dto/extraction.dto";

export class PrismaExtractionRepository implements ExtractionRepository {
  // ── Categories ──────────────────────────────────────────────

  async createCategory(data: CreateCategoryDTO): Promise<ExtractionCategory> {
    return prisma.extractionCategory.create({
      data: {
        slug: data.slug,
        name: data.name,
        model: data.model ?? "gpt-4.1-mini",
        industry: data.industry,
        description: data.description ?? null,
        platformAgentId: data.platformAgentId ?? null,
      },
    });
  }

  async updateCategory(
    id: string,
    data: UpdateCategoryDTO,
  ): Promise<ExtractionCategory> {
    const updateData: Prisma.ExtractionCategoryUncheckedUpdateInput = {};

    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.industry !== undefined) updateData.industry = data.industry;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.platformAgentId !== undefined)
      updateData.platformAgentId = data.platformAgentId;

    return prisma.extractionCategory.update({
      where: { id },
      data: updateData,
    });
  }

  async findCategoryById(id: string): Promise<CategoryWithCount | null> {
    return prisma.extractionCategory.findUnique({
      where: { id },
      include: { _count: { select: { dispositions: true } } },
    });
  }

  async findCategoryBySlug(slug: string): Promise<ExtractionCategory | null> {
    return prisma.extractionCategory.findUnique({ where: { slug } });
  }

  async findCategoryByBolnaId(
    bolnaId: string,
  ): Promise<ExtractionCategory | null> {
    return prisma.extractionCategory.findUnique({ where: { bolnaId } });
  }

  async listCategories(
    filters: ListCategoriesFilters,
  ): Promise<CategoryWithCount[]> {
    return prisma.extractionCategory.findMany({
      where: {
        ...(filters.industry !== undefined && { industry: filters.industry }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.platformAgentId !== undefined && {
          platformAgentId: filters.platformAgentId,
        }),
      },
      orderBy: [{ createdAt: "desc" }],
      include: { _count: { select: { dispositions: true } } },
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await prisma.extractionCategory.delete({ where: { id } });
  }

  async countDispositionsInCategory(categoryId: string): Promise<number> {
    return prisma.extractionDisposition.count({ where: { categoryId } });
  }

  async upsertCategoryByBolnaId(data: {
    bolnaId: string;
    slug: string;
    name: string;
    model: string;
    platformAgentId: string;
    industry: Industry;
  }): Promise<ExtractionCategory> {
    return prisma.extractionCategory.upsert({
      where: { bolnaId: data.bolnaId },
      create: {
        bolnaId: data.bolnaId,
        slug: data.slug,
        name: data.name,
        model: data.model,
        platformAgentId: data.platformAgentId,
        industry: data.industry,
      },
      update: {
        name: data.name,
        model: data.model,
      },
    });
  }

  // ── Dispositions ────────────────────────────────────────────

  async createDisposition(
    data: CreateDispositionDTO,
  ): Promise<ExtractionDisposition> {
    return prisma.extractionDisposition.create({
      data: {
        slug: data.slug,
        name: data.name,
        question: data.question,
        systemPrompt: data.systemPrompt ?? null,
        model: data.model ?? "gpt-4.1-mini",
        isSubjective: data.isSubjective ?? false,
        isObjective: data.isObjective ?? false,
        subjectiveType: data.subjectiveType ?? "text",
        subjectiveTypeConfig: (data.subjectiveTypeConfig as any) ?? null,
        objectiveOptions: (data.objectiveOptions as any) ?? null,
        industry: data.industry,
        description: data.description ?? null,
        categoryId: data.categoryId,
      },
    });
  }

  async updateDisposition(
    id: string,
    data: UpdateDispositionDTO,
  ): Promise<ExtractionDisposition> {
    const updateData: Prisma.ExtractionDispositionUncheckedUpdateInput = {};

    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.name !== undefined) updateData.name = data.name;
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
        (data.subjectiveTypeConfig as any) ?? Prisma.JsonNull;
    if (data.objectiveOptions !== undefined)
      updateData.objectiveOptions =
        (data.objectiveOptions as any) ?? Prisma.JsonNull;
    if (data.industry !== undefined) updateData.industry = data.industry;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;

    return prisma.extractionDisposition.update({
      where: { id },
      data: updateData,
    });
  }

  async findDispositionById(id: string): Promise<ExtractionDisposition | null> {
    return prisma.extractionDisposition.findUnique({ where: { id } });
  }

  async findDispositionBySlug(
    slug: string,
  ): Promise<ExtractionDisposition | null> {
    return prisma.extractionDisposition.findUnique({ where: { slug } });
  }

  async findDispositionByBolnaId(
    bolnaId: string,
  ): Promise<ExtractionDisposition | null> {
    return prisma.extractionDisposition.findUnique({ where: { bolnaId } });
  }

  async listDispositions(
    filters: ListDispositionsFilters,
  ): Promise<ExtractionDisposition[]> {
    return prisma.extractionDisposition.findMany({
      where: {
        ...(filters.industry !== undefined && { industry: filters.industry }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.categoryId !== undefined && {
          categoryId: filters.categoryId,
        }),
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async deleteDisposition(id: string): Promise<void> {
    await prisma.extractionDisposition.delete({ where: { id } });
  }

  async upsertDispositionByBolnaId(data: {
    bolnaId: string;
    slug: string;
    name: string;
    question: string;
    systemPrompt: string | null;
    model: string;
    isSubjective: boolean;
    isObjective: boolean;
    subjectiveType: string;
    subjectiveTypeConfig: unknown;
    objectiveOptions: unknown;
    categoryId: string;
    industry: Industry;
  }): Promise<ExtractionDisposition> {
    return prisma.extractionDisposition.upsert({
      where: { bolnaId: data.bolnaId },
      create: {
        bolnaId: data.bolnaId,
        slug: data.slug,
        name: data.name,
        question: data.question,
        systemPrompt: data.systemPrompt,
        model: data.model,
        isSubjective: data.isSubjective,
        isObjective: data.isObjective,
        subjectiveType: data.subjectiveType,
        subjectiveTypeConfig:
          (data.subjectiveTypeConfig as any) ?? Prisma.JsonNull,
        objectiveOptions: (data.objectiveOptions as any) ?? Prisma.JsonNull,
        categoryId: data.categoryId,
        industry: data.industry,
      },
      update: {
        name: data.name,
        question: data.question,
        systemPrompt: data.systemPrompt,
        model: data.model,
        isSubjective: data.isSubjective,
        isObjective: data.isObjective,
        subjectiveType: data.subjectiveType,
        subjectiveTypeConfig:
          (data.subjectiveTypeConfig as any) ?? Prisma.JsonNull,
        objectiveOptions: (data.objectiveOptions as any) ?? Prisma.JsonNull,
        categoryId: data.categoryId,
      },
    });
  }
}
