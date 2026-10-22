export interface TenantApiKeyEntity {
  id: string;
  keyIdentifier: string;
  secretHash: string;
  tenantId: string;
  createdBy: string;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  tenant?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
}
