export type CreateTenantApiKeyDto = Record<string, never>;

export interface ApiKeyCreatorDto {
  id: string;
  name: string;
  email: string;
}

export interface CreatedTenantApiKeyResponseDto {
  id: string;
  keyIdentifier: string;
  fullKey: string;
  createdAt: string;
  createdBy: ApiKeyCreatorDto | null;
}

export interface TenantApiKeyListItemDto {
  id: string;
  keyIdentifier: string;
  maskedKey: string;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: ApiKeyCreatorDto | null;
}

export interface TenantApiKeyPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TenantApiKeyListResponseDto {
  items: TenantApiKeyListItemDto[];
  pagination: TenantApiKeyPaginationMeta;
}
