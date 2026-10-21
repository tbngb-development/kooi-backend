import { type RequiredVariable } from "../../../../shared/types/bolna.types";
import { type AssistantEntityData } from "../../domain/entities/assistant.entity";
import type { PlatformAgentType } from "@prisma/client";
import type { AssistantVariablesConfig } from "../../domain/types/assistant-variable.types";

export interface RegisterAssistantData {
  platformAgentId: string;
  name: string;
  config: Record<string, unknown>;
  variables?: AssistantVariablesConfig;
}

export interface AssistantWithPlatformAgent {
  id: string;
  name: string;
  tenantId: string;
  platformAgentId: string;
  config: Record<string, unknown>;
  variables: AssistantVariablesConfig | null;
  createdAt: Date;
  updatedAt: Date;
  platformAgent: {
    id: string;
    bolnaId: string;
    name: string;
    slug: string;
    type: PlatformAgentType;
    systemPrompt: string | null;
    welcomeMessage: string | null;
    requiredVariables: RequiredVariable[] | null;
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

export interface InboundAssistantResult {
  id: string;
  name: string;
  tenantId: string;
  variables: unknown;
  platformAgent: {
    id: string;
    name: string;
    type: string;
    welcomeMessage: string | null;
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
    data: { name?: string; variables?: AssistantVariablesConfig },
  ): Promise<AssistantEntityData>;
  updateConfig(
    tenantId: string,
    id: string,
    config: Record<string, unknown>,
  ): Promise<AssistantEntityData>;

  findByTenantId(tenantId: string): Promise<
    Array<{
      id: string;
      name: string;
      platformAgentId: string;
      tenantId: string;
      config: Record<string, unknown>;
    }>
  >;

  repointPlatformAgent(
    assistantId: string,
    newPlatformAgentId: string,
  ): Promise<void>;
  /** Find active inbound-capable assistant by Bolna agent ID */
  findInboundByBolnaAgentId(
    agentId: string,
  ): Promise<InboundAssistantResult | null>;
  softDelete(tenantId: string, id: string): Promise<void>;
  restore(tenantId: string, id: string): Promise<void>;
}
