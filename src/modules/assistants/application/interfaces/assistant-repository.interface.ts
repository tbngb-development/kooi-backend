import { type RequiredVariable } from "../../../../shared/types/bolna.types";
import { type AssistantEntityData } from "../../domain/entities/assistant.entity";

export interface RegisterAssistantData {
  platformAgentId: string;
  name: string;
  config: Record<string, unknown>;
}
export interface AssistantWithPlatformAgent {
  id: string;
  name: string;
  tenantId: string;
  platformAgentId: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  platformAgent: {
    id: string;
    bolnaId: string;
    name: string;
    slug: string;
    systemPrompt: string | null; // Already present
    welcomeMessage: string | null;
    requiredVariables: RequiredVariable[] | null; // [ADD]
    description: string | null;
    category: string | null;
    isFeatured: boolean;
    industryPack: {
      id: string;
      name: string;
      slug: string;
    } | null;
  };
}

export interface AssistantRepository {
  list(tenantId: string): Promise<AssistantEntityData[]>;
  findById(tenantId: string, id: string): Promise<AssistantEntityData | null>;
  findByIdWithPlatformAgent(
    tenantId: string,
    id: string,
  ): Promise<AssistantWithPlatformAgent | null>;
  findByPlatformAgentId(
    tenantId: string | null,
    platformAgentId: string,
  ): Promise<AssistantEntityData | null>;
  create(
    tenantId: string,
    data: RegisterAssistantData,
  ): Promise<AssistantEntityData>;
  update(
    tenantId: string,
    id: string,
    name: string,
  ): Promise<AssistantEntityData>;
  updateConfig(
    tenantId: string,
    id: string,
    config: Record<string, unknown>,
  ): Promise<AssistantEntityData>;
  delete(tenantId: string, id: string): Promise<void>;
  getCampaignReferenceCount(id: string): Promise<number>;
}
