export interface CreateSarvamConfigurationDTO {
  tenantId: string;
  apiKey: string;
  workspaceId: string;
  organizationId: string;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateSarvamConfigurationDTO {
  id: string;
  apiKey?: string;
  workspaceId?: string;
  organizationId?: string;
  isActive?: boolean;
  updatedBy: string;
}

export interface ListSarvamConfigurationsQueryDTO {
  page?: number;
  limit?: number;
  search?: string;
  tenantId?: string;
  isActive?: boolean;
}

export interface SarvamConfigurationResponseDTO {
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

export interface PaginatedSarvamConfigurationsResponseDTO {
  items: SarvamConfigurationResponseDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SarvamCredentialsInternalDTO {
  tenantId: string;
  apiKey: string;
  workspaceId: string;
  organizationId: string;
  isActive: boolean;
}

