import type { ExtractionCategory, ExtractionDisposition, Industry } from "@prisma/client";
import type {
  CreateCategoryDTO, UpdateCategoryDTO, ListCategoriesFilters,
  CreateDispositionDTO, UpdateDispositionDTO, ListDispositionsFilters,
} from "../dto/extraction.dto";

export type CategoryWithCount = ExtractionCategory & {
  _count: { dispositions: number };
};

export type CategoryWithDispositions = ExtractionCategory & {
  dispositions: ExtractionDisposition[];
};

export interface ExtractionRepository {
  // ── Categories ──────────────────────────────────────────────
  createCategory(data: CreateCategoryDTO): Promise<ExtractionCategory>;
  updateCategory(id: string, data: UpdateCategoryDTO): Promise<ExtractionCategory>;
  findCategoryById(id: string): Promise<CategoryWithCount | null>;
  findCategoryBySlug(slug: string): Promise<ExtractionCategory | null>;
  findCategoryByBolnaId(bolnaId: string): Promise<ExtractionCategory | null>;
  listCategories(filters: ListCategoriesFilters): Promise<CategoryWithCount[]>;
  deleteCategory(id: string): Promise<void>;
  countDispositionsInCategory(categoryId: string): Promise<number>;
  upsertCategoryByBolnaId(data: {
    bolnaId: string;
    slug: string;
    name: string;
    model: string;
    platformAgentId: string;
    industry: Industry;
  }): Promise<ExtractionCategory>;

  // ── Dispositions ────────────────────────────────────────────
  createDisposition(data: CreateDispositionDTO): Promise<ExtractionDisposition>;
  updateDisposition(id: string, data: UpdateDispositionDTO): Promise<ExtractionDisposition>;
  findDispositionById(id: string): Promise<ExtractionDisposition | null>;
  findDispositionBySlug(slug: string): Promise<ExtractionDisposition | null>;
  findDispositionByBolnaId(bolnaId: string): Promise<ExtractionDisposition | null>;
  listDispositions(filters: ListDispositionsFilters): Promise<ExtractionDisposition[]>;
  deleteDisposition(id: string): Promise<void>;
  upsertDispositionByBolnaId(data: {
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
  }): Promise<ExtractionDisposition>;
}