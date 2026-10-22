import type { TenantApiKeyEntity } from "../../domain/entities/tenant-api-key.entity";

export interface CreateTenantApiKeyInput {
  keyIdentifier: string;
  secretHash: string;
  tenantId: string;
  createdBy: string;
}

export interface ITenantApiKeyRepository {
  create(input: CreateTenantApiKeyInput): Promise<TenantApiKeyEntity>;
  findByKeyIdentifier(keyIdentifier: string): Promise<TenantApiKeyEntity | null>;
  findByIdAndTenantId(id: string, tenantId: string): Promise<TenantApiKeyEntity | null>;
  listByTenantId(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ items: TenantApiKeyEntity[]; total: number }>;
  deleteByIdAndTenantId(id: string, tenantId: string): Promise<boolean>;
  updateLastAccessedAt(id: string, timestamp: Date): Promise<void>;
}
