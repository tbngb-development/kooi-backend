import type {
  BolnaAgentResponse,
  BolnaExtractionCategoryListResponse,
  BolnaCreateAgentPayload,
  BolnaCreateAgentResponse,
  BolnaUserProfile,
} from "../../../../shared/types/bolna.types";

export interface BolnaTemplateData {
  bolnaId: string;
  agentName: string;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  defaultConfig: Record<string, unknown>;
}

export interface BolnaTemplateProvider {
  fetchTemplate(
    bolnaId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaTemplateData>;
  listAllAgents(): Promise<BolnaAgentResponse[]>;
  listCategories(
    agentBolnaId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaExtractionCategoryListResponse>;
  createAgent(
    payload: BolnaCreateAgentPayload,
    bolnaApiKeyId: string,
  ): Promise<BolnaCreateAgentResponse>;
  deleteAgent(bolnaId: string, bolnaApiKeyId: string): Promise<void>;
  fetchUserProfile(bolnaApiKeyId: string): Promise<BolnaUserProfile>;
}
