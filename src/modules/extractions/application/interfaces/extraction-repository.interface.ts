import type {
  ExtractionCategory,
  ExtractionDisposition,
  IndustryPack,
  PlatformAgent,
} from "@prisma/client";
import type {
  CreateCategoryDTO,
  UpdateCategoryDTO,
  ListCategoriesFilters,
  CreateDispositionDTO,
  UpdateDispositionDTO,
  ListDispositionsFilters,
} from "../dto/extraction.dto";

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Category with junction-table counts (dispositions, industries, agents) */
export type CategoryWithCount = ExtractionCategory & {
  _count: {
    dispositions: number;
    industries: number;
    platformAgents: number;
  };
};

/** Category with full M2M relations expanded */
export type CategoryWithRelations = ExtractionCategory & {
  industries: {
    industryPack: IndustryPack;
  }[];
  dispositions: {
    disposition: ExtractionDisposition;
    sortOrder: number;
  }[];
  platformAgents: {
    platformAgent: PlatformAgent;
  }[];
};

/** Disposition with full M2M relations expanded */
export type DispositionWithRelations = ExtractionDisposition & {
  industries: {
    industryPack: IndustryPack;
  }[];
  categories: {
    category: ExtractionCategory;
    sortOrder: number;
  }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// REPOSITORY INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractionRepository {
  // ── Categories: CRUD ──────────────────────────────────────────────────────

  createCategory(data: CreateCategoryDTO): Promise<ExtractionCategory>;
  updateCategory(
    id: string,
    data: UpdateCategoryDTO,
  ): Promise<ExtractionCategory>;
  findCategoryById(id: string): Promise<CategoryWithCount | null>;
  findCategoryByIdWithRelations(
    id: string,
  ): Promise<CategoryWithRelations | null>;
  findCategoryBySlug(slug: string): Promise<ExtractionCategory | null>;
  findCategoryByNameInsensitive(
    name: string,
  ): Promise<ExtractionCategory | null>;
  listCategories(filters: ListCategoriesFilters): Promise<CategoryWithCount[]>;
  deleteCategory(id: string): Promise<void>;

  // ── Categories: M2M Industries ────────────────────────────────────────────

  attachIndustriesToCategory(
    categoryId: string,
    industryPackIds: string[],
  ): Promise<void>;
  detachIndustryFromCategory(
    categoryId: string,
    industryPackId: string,
  ): Promise<void>;
  detachAllIndustriesFromCategory(categoryId: string): Promise<void>;

  // ── Categories: M2M Dispositions ──────────────────────────────────────────

  attachDispositionsToCategory(
    categoryId: string,
    dispositionIds: string[],
  ): Promise<void>;
  detachDispositionFromCategory(
    categoryId: string,
    dispositionId: string,
  ): Promise<void>;
  detachAllDispositionsFromCategory(categoryId: string): Promise<void>;
  countDispositionsInCategory(categoryId: string): Promise<number>;

  // ── Categories: Guards ────────────────────────────────────────────────────

  isCategoryAttachedToAgent(categoryId: string): Promise<boolean>;

  // ── Dispositions: CRUD ────────────────────────────────────────────────────

  createDisposition(data: CreateDispositionDTO): Promise<ExtractionDisposition>;
  updateDisposition(
    id: string,
    data: UpdateDispositionDTO,
  ): Promise<ExtractionDisposition>;
  findDispositionById(id: string): Promise<ExtractionDisposition | null>;
  findDispositionByIdWithRelations(
    id: string,
  ): Promise<DispositionWithRelations | null>;
  findDispositionBySlug(slug: string): Promise<ExtractionDisposition | null>;
  findDispositionByNameInsensitive(
    name: string,
  ): Promise<ExtractionDisposition | null>;
  listDispositions(
    filters: ListDispositionsFilters,
  ): Promise<ExtractionDisposition[]>;
  deleteDisposition(id: string): Promise<void>;

  // ── Dispositions: M2M Industries ──────────────────────────────────────────

  attachIndustriesToDisposition(
    dispositionId: string,
    industryPackIds: string[],
  ): Promise<void>;
  detachIndustryFromDisposition(
    dispositionId: string,
    industryPackId: string,
  ): Promise<void>;
  detachAllIndustriesFromDisposition(dispositionId: string): Promise<void>;

  // ── Dispositions: Guards ──────────────────────────────────────────────────

  isDispositionAttachedToAgent(dispositionId: string): Promise<boolean>;
}
