import type { PlatformAgentType } from "@prisma/client";
import type { AssistantVariablesConfig } from "../types/assistant-variable.types";

export interface RegisterAssistantInput {
  tenantId: string;
  name: string;
  platformAgentId: string;
  variables?: AssistantVariablesConfig;
}

export interface UpdateAssistantInput {
  tenantId: string;
  id: string;
  name?: string;
  variables?: AssistantVariablesConfig;
}

export interface GetAssistantOutput {
  assistant: {
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
      welcomeMessage: string | null;
      description: string | null;
      category: string | null;
      isFeatured: boolean;
      industryPack: {
        id: string;
        name: string;
        slug: string;
      } | null;
    };
  };
  variables: {
    key: string;
    label: string;
    required: boolean;
    isEditable: boolean;
    inputType: string;
    defaultValue: string | null;
  }[];
}

export interface AssistantEntityData {
  id: string;
  name: string;
  tenantId: string;
  platformAgentId: string;
  config: Record<string, unknown>;
  variables: AssistantVariablesConfig | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  platformAgent?: {
    id: string;
    bolnaId: string;
    name: string;
    slug: string;
    type?: PlatformAgentType;
    welcomeMessage?: string | null;
    category?: string | null;
    industryPack?: {
      id: string;
      name: string;
      slug: string;
      icon?: string | null;
    } | null;
  } | null;
}

