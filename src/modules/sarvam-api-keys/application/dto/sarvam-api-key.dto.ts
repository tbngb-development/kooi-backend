export interface CreateSarvamApiKeyDTO {
  tenantId: string;
  apiKey: string;
  workspaceId: string;
  organizationId: string;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateSarvamApiKeyDTO {
  id: string;
  apiKey?: string;
  workspaceId?: string;
  organizationId?: string;
  isActive?: boolean;
  updatedBy: string;
}

export interface ListSarvamApiKeysQueryDTO {
  page?: number;
  limit?: number;
  search?: string;
  tenantId?: string;
  isActive?: boolean;
}

export interface SarvamApiKeyResponseDTO {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  workspaceId: string;
  organizationId: string;
  maskedApiKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string | null;
}

export interface PaginatedSarvamApiKeysResponseDTO {
  items: SarvamApiKeyResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SarvamApiKeyInternalDTO {
  tenantId: string;
  apiKey: string;
  workspaceId: string;
  organizationId: string;
  isActive: boolean;
}

