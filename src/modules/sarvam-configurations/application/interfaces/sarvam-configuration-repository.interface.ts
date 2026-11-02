import type { SarvamConfiguration, Tenant } from "@prisma/client";

export type SarvamConfigurationWithTenant = SarvamConfiguration & {
  tenant: Pick<Tenant, "id" | "name" | "email" | "isActive">;
};

export interface CreateSarvamConfigurationRecord {
  tenantId: string;
  apiKeyEncrypted: string;
  workspaceId: string;
  organizationId: string;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateSarvamConfigurationRecord {
  apiKeyEncrypted?: string;
  workspaceId?: string;
  organizationId?: string;
  isActive?: boolean;
  updatedBy: string;
}

export interface ListSarvamConfigurationFilter {
  page?: number;
  limit?: number;
  search?: string;
  tenantId?: string;
  isActive?: boolean;
}

export interface ISarvamConfigurationRepository {
  create(data: CreateSarvamConfigurationRecord): Promise<SarvamConfigurationWithTenant>;
  update(
    id: string,
    data: UpdateSarvamConfigurationRecord,
  ): Promise<SarvamConfigurationWithTenant>;
  findById(id: string): Promise<SarvamConfigurationWithTenant | null>;
  findByTenantId(tenantId: string): Promise<SarvamConfigurationWithTenant | null>;
  list(filter: ListSarvamConfigurationFilter): Promise<{
    items: SarvamConfigurationWithTenant[];
    total: number;
  }>;
  delete(id: string): Promise<void>;
  existsForTenant(tenantId: string): Promise<boolean>;
  tenantExists(tenantId: string): Promise<boolean>;
}

