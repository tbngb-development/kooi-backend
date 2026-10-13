import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/create-category.use-case";
import { GetCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/get-category.use-case";
import { ListCategoriesUseCase } from "../../../src/modules/extractions/application/use-cases/list-categories.use-case";
import { UpdateCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/update-category.use-case";
import { DeleteCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/delete-category.use-case";

import { CreateDispositionUseCase } from "../../../src/modules/extractions/application/use-cases/create-disposition.use-case";
import { GetDispositionUseCase } from "../../../src/modules/extractions/application/use-cases/get-disposition.use-case";
import { ListDispositionsUseCase } from "../../../src/modules/extractions/application/use-cases/list-dispositions.use-case";
import { UpdateDispositionUseCase } from "../../../src/modules/extractions/application/use-cases/update-disposition.use-case";
import { DeleteDispositionUseCase } from "../../../src/modules/extractions/application/use-cases/delete-disposition.use-case";

import { AttachIndustriesToCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/attach-industries-to-category.use-case";
import { DetachIndustryFromCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/detach-industry-from-category.use-case";
import { AttachDispositionsToCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/attach-dispositions-to-category.use-case";
import { DetachDispositionFromCategoryUseCase } from "../../../src/modules/extractions/application/use-cases/detach-disposition-from-category.use-case";
import { AttachIndustriesToDispositionUseCase } from "../../../src/modules/extractions/application/use-cases/attach-industries-to-disposition.use-case";
import { DetachIndustryFromDispositionUseCase } from "../../../src/modules/extractions/application/use-cases/detach-industry-from-disposition.use-case";

import type { ExtractionRepository, CategoryWithCount, CategoryWithRelations, DispositionWithRelations } from "../../../src/modules/extractions/application/interfaces/extraction-repository.interface";
import type { ExtractionCategory, ExtractionDisposition } from "@prisma/client";
import {
  ExtractionCategoryNotFoundError,
  ExtractionDispositionNotFoundError,
  DuplicateExtractionCategorySlugError,
  DuplicateExtractionCategoryNameError,
  DuplicateExtractionDispositionSlugError,
  DuplicateExtractionDispositionNameError,
  ExtractionCategoryAttachedToAgentError,
  ExtractionDispositionAttachedToAgentError,
} from "../../../src/modules/extractions/domain/errors/extraction.errors";

describe("Extraction Taxonomy (Categories & Dispositions) Use Cases (Module 11)", () => {
  let mockRepo: { [K in keyof ExtractionRepository]: ReturnType<typeof vi.fn> };

  const sampleCategory: ExtractionCategory = {
    id: "cat-1",
    slug: "lead-qualification",
    name: "Lead Qualification",
    model: "gpt-4.1-mini",
    description: "Categories for qualifying prospects",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleDisposition: ExtractionDisposition = {
    id: "disp-1",
    slug: "customer-intent",
    name: "Customer Intent",
    displayName: "Intent",
    tag: "sales",
    question: "What is customer intent?",
    systemPrompt: null,
    model: "gpt-4.1-mini",
    isSubjective: false,
    isObjective: true,
    subjectiveType: "text",
    subjectiveTypeConfig: null,
    objectiveOptions: [{ value: "HIGH", condition: "High intent" }],
    description: null,
    isActive: true,
    showInOverview: true,
    showInInsights: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      findCategoryById: vi.fn(),
      findCategoryByIdWithRelations: vi.fn(),
      findCategoryBySlug: vi.fn(),
      findCategoryByNameInsensitive: vi.fn(),
      listCategories: vi.fn(),
      deleteCategory: vi.fn(),
      attachIndustriesToCategory: vi.fn(),
      detachIndustryFromCategory: vi.fn(),
      detachAllIndustriesFromCategory: vi.fn(),
      attachDispositionsToCategory: vi.fn(),
      detachDispositionFromCategory: vi.fn(),
      detachAllDispositionsFromCategory: vi.fn(),
      countDispositionsInCategory: vi.fn(),
      isCategoryAttachedToAgent: vi.fn(),
      createDisposition: vi.fn(),
      updateDisposition: vi.fn(),
      findDispositionById: vi.fn(),
      findDispositionByIdWithRelations: vi.fn(),
      findDispositionBySlug: vi.fn(),
      findDispositionByNameInsensitive: vi.fn(),
      listDispositions: vi.fn(),
      deleteDisposition: vi.fn(),
      attachIndustriesToDisposition: vi.fn(),
      detachIndustryFromDisposition: vi.fn(),
      detachAllIndustriesFromDisposition: vi.fn(),
      isDispositionAttachedToAgent: vi.fn(),
    };
  });

  describe("Category CRUD Use Cases", () => {
    it("CreateCategoryUseCase throws DuplicateExtractionCategorySlugError when slug exists", async () => {
      const useCase = new CreateCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryBySlug.mockResolvedValue(sampleCategory);

      await expect(
        useCase.execute({
          slug: "lead-qualification",
          name: "Other Name",
        }),
      ).rejects.toThrow(DuplicateExtractionCategorySlugError);
    });

    it("CreateCategoryUseCase throws DuplicateExtractionCategoryNameError when name exists case-insensitively", async () => {
      const useCase = new CreateCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryBySlug.mockResolvedValue(null);
      mockRepo.findCategoryByNameInsensitive.mockResolvedValue(sampleCategory);

      await expect(
        useCase.execute({
          slug: "other-slug",
          name: "lead qualification",
        }),
      ).rejects.toThrow(DuplicateExtractionCategoryNameError);
    });

    it("CreateCategoryUseCase creates category when slug and name are unique", async () => {
      const useCase = new CreateCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryBySlug.mockResolvedValue(null);
      mockRepo.findCategoryByNameInsensitive.mockResolvedValue(null);
      mockRepo.createCategory.mockResolvedValue(sampleCategory);

      const created = await useCase.execute({
        slug: "lead-qualification",
        name: "Lead Qualification",
      });

      expect(created).toEqual(sampleCategory);
    });

    it("GetCategoryUseCase throws ExtractionCategoryNotFoundError when not found", async () => {
      const useCase = new GetCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryByIdWithRelations.mockResolvedValue(null);

      await expect(useCase.execute("missing-cat")).rejects.toThrow(ExtractionCategoryNotFoundError);
    });

    it("GetCategoryUseCase returns category with relations when found", async () => {
      const useCase = new GetCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      const categoryWithRelations: CategoryWithRelations = {
        ...sampleCategory,
        industries: [],
        dispositions: [],
        platformAgents: [],
      };
      mockRepo.findCategoryByIdWithRelations.mockResolvedValue(categoryWithRelations);

      const result = await useCase.execute("cat-1");
      expect(result).toEqual(categoryWithRelations);
    });

    it("ListCategoriesUseCase returns categories from repository", async () => {
      const useCase = new ListCategoriesUseCase(mockRepo as unknown as ExtractionRepository);
      const categoryWithCount: CategoryWithCount = {
        ...sampleCategory,
        _count: { dispositions: 2, industries: 1, platformAgents: 0 },
      };
      mockRepo.listCategories.mockResolvedValue([categoryWithCount]);

      const list = await useCase.execute({ isActive: true });
      expect(list).toHaveLength(1);
      expect(list[0]._count.dispositions).toBe(2);
    });

    it("DeleteCategoryUseCase throws ExtractionCategoryAttachedToAgentError when assigned to platform agents", async () => {
      const useCase = new DeleteCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryById.mockResolvedValue(sampleCategory as any);
      mockRepo.isCategoryAttachedToAgent.mockResolvedValue(true);

      await expect(useCase.execute("cat-1")).rejects.toThrow(ExtractionCategoryAttachedToAgentError);
    });

    it("DeleteCategoryUseCase deletes category when not attached to agents", async () => {
      const useCase = new DeleteCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryById.mockResolvedValue(sampleCategory as any);
      mockRepo.isCategoryAttachedToAgent.mockResolvedValue(false);
      mockRepo.deleteCategory.mockResolvedValue(undefined);

      await useCase.execute("cat-1");
      expect(mockRepo.deleteCategory).toHaveBeenCalledWith("cat-1");
    });
  });

  describe("Disposition CRUD Use Cases", () => {
    it("CreateDispositionUseCase throws DuplicateExtractionDispositionSlugError when slug exists", async () => {
      const useCase = new CreateDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionBySlug.mockResolvedValue(sampleDisposition);

      await expect(
        useCase.execute({
          slug: "customer-intent",
          name: "Other Name",
          displayName: "Other",
          question: "Question?",
        }),
      ).rejects.toThrow(DuplicateExtractionDispositionSlugError);
    });

    it("CreateDispositionUseCase throws DuplicateExtractionDispositionNameError when name exists case-insensitively", async () => {
      const useCase = new CreateDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionBySlug.mockResolvedValue(null);
      mockRepo.findDispositionByNameInsensitive.mockResolvedValue(sampleDisposition);

      await expect(
        useCase.execute({
          slug: "other-slug",
          name: "customer intent",
          displayName: "Other",
          question: "Question?",
        }),
      ).rejects.toThrow(DuplicateExtractionDispositionNameError);
    });

    it("CreateDispositionUseCase creates disposition when slug and name are unique", async () => {
      const useCase = new CreateDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionBySlug.mockResolvedValue(null);
      mockRepo.findDispositionByNameInsensitive.mockResolvedValue(null);
      mockRepo.createDisposition.mockResolvedValue(sampleDisposition);

      const created = await useCase.execute({
        slug: "customer-intent",
        name: "Customer Intent",
        displayName: "Intent",
        question: "What is customer intent?",
      });

      expect(created).toEqual(sampleDisposition);
    });

    it("GetDispositionUseCase throws ExtractionDispositionNotFoundError when not found", async () => {
      const useCase = new GetDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionByIdWithRelations.mockResolvedValue(null);

      await expect(useCase.execute("missing-disp")).rejects.toThrow(ExtractionDispositionNotFoundError);
    });

    it("DeleteDispositionUseCase throws ExtractionDispositionAttachedToAgentError when assigned to platform agents", async () => {
      const useCase = new DeleteDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.isDispositionAttachedToAgent.mockResolvedValue(true);

      await expect(useCase.execute("disp-1")).rejects.toThrow(ExtractionDispositionAttachedToAgentError);
    });

    it("DeleteDispositionUseCase deletes disposition when not attached to agents", async () => {
      const useCase = new DeleteDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.isDispositionAttachedToAgent.mockResolvedValue(false);
      mockRepo.deleteDisposition.mockResolvedValue(undefined);

      await useCase.execute("disp-1");
      expect(mockRepo.deleteDisposition).toHaveBeenCalledWith("disp-1");
    });
  });

  describe("M2M Associations Use Cases", () => {
    it("AttachIndustriesToCategoryUseCase delegates to repository", async () => {
      const useCase = new AttachIndustriesToCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryById.mockResolvedValue(sampleCategory as any);
      mockRepo.attachIndustriesToCategory.mockResolvedValue(undefined);

      await useCase.execute("cat-1", { industryPackIds: ["pack-1", "pack-2"] });
      expect(mockRepo.attachIndustriesToCategory).toHaveBeenCalledWith("cat-1", ["pack-1", "pack-2"]);
    });

    it("DetachIndustryFromCategoryUseCase delegates to repository", async () => {
      const useCase = new DetachIndustryFromCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryById.mockResolvedValue(sampleCategory as any);
      mockRepo.detachIndustryFromCategory.mockResolvedValue(undefined);

      await useCase.execute("cat-1", "pack-1");
      expect(mockRepo.detachIndustryFromCategory).toHaveBeenCalledWith("cat-1", "pack-1");
    });

    it("AttachDispositionsToCategoryUseCase delegates to repository", async () => {
      const useCase = new AttachDispositionsToCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryById.mockResolvedValue(sampleCategory as any);
      mockRepo.attachDispositionsToCategory.mockResolvedValue(undefined);

      await useCase.execute("cat-1", { dispositionIds: ["disp-1"] });
      expect(mockRepo.attachDispositionsToCategory).toHaveBeenCalledWith("cat-1", ["disp-1"]);
    });

    it("DetachDispositionFromCategoryUseCase delegates to repository", async () => {
      const useCase = new DetachDispositionFromCategoryUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findCategoryById.mockResolvedValue(sampleCategory as any);
      mockRepo.detachDispositionFromCategory.mockResolvedValue(undefined);

      await useCase.execute("cat-1", "disp-1");
      expect(mockRepo.detachDispositionFromCategory).toHaveBeenCalledWith("cat-1", "disp-1");
    });

    it("AttachIndustriesToDispositionUseCase delegates to repository", async () => {
      const useCase = new AttachIndustriesToDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.attachIndustriesToDisposition.mockResolvedValue(undefined);

      await useCase.execute("disp-1", { industryPackIds: ["pack-1"] });
      expect(mockRepo.attachIndustriesToDisposition).toHaveBeenCalledWith("disp-1", ["pack-1"]);
    });

    it("DetachIndustryFromDispositionUseCase delegates to repository", async () => {
      const useCase = new DetachIndustryFromDispositionUseCase(mockRepo as unknown as ExtractionRepository);
      mockRepo.findDispositionById.mockResolvedValue(sampleDisposition);
      mockRepo.detachIndustryFromDisposition.mockResolvedValue(undefined);

      await useCase.execute("disp-1", "pack-1");
      expect(mockRepo.detachIndustryFromDisposition).toHaveBeenCalledWith("disp-1", "pack-1");
    });
  });
});
