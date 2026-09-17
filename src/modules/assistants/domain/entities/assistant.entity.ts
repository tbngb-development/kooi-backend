export interface RegisterAssistantInput {
  tenantId: string;
  name: string;
  platformAgentId: string;
}

export interface UpdateAssistantInput {
  tenantId: string;
  id: string;
  name: string;
}

export interface GetAssistantOutput {
  assistant: {
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
  variables: { key: string; label: string }[];
}

export interface AssistantEntityData {
  id: string;
  name: string;
  tenantId: string;
  platformAgentId: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
