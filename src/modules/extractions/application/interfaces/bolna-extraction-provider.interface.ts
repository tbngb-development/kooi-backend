import type {
  BolnaCategoryCreatePayload,
  BolnaDispositionCreatePayload,
  BolnaDispositionCreateResponse,
  BolnaExtractionCategoryListResponse,
  BolnaExtractionCategoryResponse,
  BolnaDispositionResponse,
} from "../../../../shared/types/bolna.types";

export interface BolnaExtractionProvider {
  listCategories(
    agentId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaExtractionCategoryListResponse>;

  listDispositions(
    agentId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaDispositionResponse[]>;

  createCategory(
    agentId: string,
    payload: BolnaCategoryCreatePayload,
    bolnaApiKeyId?: string,
  ): Promise<BolnaExtractionCategoryResponse>;

  updateCategory(
    categoryId: string,
    payload: { name?: string; model?: string },
    bolnaApiKeyId?: string,
  ): Promise<void>;

  createDisposition(
    payload: BolnaDispositionCreatePayload,
    bolnaApiKeyId?: string,
  ): Promise<BolnaDispositionCreateResponse>;

  updateDisposition(
    dispositionId: string,
    payload: Partial<BolnaDispositionCreatePayload>,
    bolnaApiKeyId?: string,
  ): Promise<void>;

  deleteDisposition(
    dispositionId: string,
    bolnaApiKeyId?: string,
  ): Promise<void>;

  deleteCategory(categoryId: string, bolnaApiKeyId?: string): Promise<void>;
}
