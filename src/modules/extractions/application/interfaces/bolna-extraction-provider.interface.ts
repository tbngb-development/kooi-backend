import type {
  BolnaExtractionCategoryResponse,
  BolnaExtractionCategoryListResponse,
  BolnaDispositionResponse,
  BolnaDispositionCreatePayload,
  BolnaDispositionCreateResponse,
  BolnaCategoryCreatePayload,
} from "../../../../shared/types/bolna.types";

export interface BolnaExtractionProvider {
  listCategories(agentBolnaId: string): Promise<BolnaExtractionCategoryListResponse>;
  createCategory(agentBolnaId: string, payload: BolnaCategoryCreatePayload): Promise<BolnaExtractionCategoryResponse>;
  updateCategory(bolnaCategoryId: string, payload: Partial<BolnaCategoryCreatePayload>): Promise<BolnaExtractionCategoryResponse>;
  deleteCategory(bolnaCategoryId: string): Promise<void>;
  listDispositions(agentBolnaId?: string): Promise<BolnaDispositionResponse[]>;
  createDisposition(payload: BolnaDispositionCreatePayload): Promise<BolnaDispositionCreateResponse>;
  updateDisposition(bolnaDispositionId: string, payload: Partial<BolnaDispositionCreatePayload>): Promise<BolnaDispositionCreateResponse>;
  deleteDisposition(bolnaDispositionId: string): Promise<void>;
}