import type { SarvamApiKey, Tenant } from "@prisma/client";

export type SarvamApiKeyWithTenant = SarvamApiKey & {
  tenant: Pick<Tenant, "id" | "name" | "email" | "isActive">;
};

export interface CreateSarvamApiKeyRecord {
  tenantId: string;
  apiKeyEncrypted: string;
  workspaceId: string;
  organizationId: string;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateSarvamApiKeyRecord {
  apiKeyEncrypted?: string;
  workspaceId?: string;
  organizationId?: string;
  isActive?: boolean;
  updatedBy: string;
}

export interface ListSarvamApiKeyFilter {
  page?: number;
  limit?: number;
  search?: string;
  tenantId?: string;
  isActive?: boolean;
}

export interface ISarvamApiKeyRepository {
  create(data: CreateSarvamApiKeyRecord): Promise<SarvamApiKeyWithTenant>;
  update(
    id: string,
    data: UpdateSarvamApiKeyRecord,
  ): Promise<SarvamApiKeyWithTenant>;
  findById(id: string): Promise<SarvamApiKeyWithTenant | null>;
  findByTenantId(tenantId: string): Promise<SarvamApiKeyWithTenant | null>;
  list(filter: ListSarvamApiKeyFilter): Promise<{
    items: SarvamApiKeyWithTenant[];
    total: number;
  }>;
  delete(id: string): Promise<void>;
  existsForTenant(tenantId: string): Promise<boolean>;
  tenantExists(tenantId: string): Promise<boolean>;
}

