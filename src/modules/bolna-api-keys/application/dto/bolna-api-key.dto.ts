import type { BolnaApiKeyType } from "@prisma/client";

export interface CreateBolnaApiKeyInput {
  keyIdentifier: string;
  plainTextKey: string;
  type: BolnaApiKeyType;
  isPlatformDefault?: boolean;
  createdBy: string;
}

export interface BolnaApiKeyResponse {
  id: string;
  keyIdentifier: string;
  type: BolnaApiKeyType;
  isPlatformDefault: boolean;
  isActive: boolean;
  assignedTenantCount: number;
  lastAccessedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignKeyInput {
  tenantId: string;
  keyId: string;
}