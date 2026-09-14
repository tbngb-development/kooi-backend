import type {
  BolnaAgentResponse,
  BolnaExtractionCategoryListResponse,
} from "../../../../shared/types/bolna.types";

export interface BolnaTemplateData {
  bolnaId: string;
  agentName: string;
  defaultConfig: Record<string, unknown>;
  systemPrompt: string | null;
}

export interface BolnaTemplateProvider {
  fetchTemplate(bolnaId: string): Promise<BolnaTemplateData>;
  listAllAgents(): Promise<BolnaAgentResponse[]>;
  listCategories(
    agentBolnaId: string,
  ): Promise<BolnaExtractionCategoryListResponse>;
}
