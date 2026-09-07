import type {
  BolnaApiKey,
  BolnaApiKeyType,
} from "@prisma/client";

export interface CreateBolnaApiKeyData {
  keyIdentifier: string;
  encryptedKey: string;
  type: BolnaApiKeyType;
  isPlatformDefault: boolean;
  createdBy: string;
}

export type BolnaApiKeyWithCount = BolnaApiKey & {
  _count: { tenants: number };
};

export interface BolnaApiKeyRepository {
  // ── Runtime resolution ────────────────────────────────────────
  findKeyForTenant(tenantId: string): Promise<BolnaApiKey | null>;
  updateLastAccessed(keyId: string): Promise<void>;

  // ── Assignment ────────────────────────────────────────────────
  assignLeastLoadedKeyToTenant(tenantId: string): Promise<BolnaApiKey>;
  assignKeyToTenant(tenantId: string, keyId: string): Promise<void>;

  // ── Admin CRUD ────────────────────────────────────────────────
  create(data: CreateBolnaApiKeyData): Promise<BolnaApiKey>;
  list(): Promise<BolnaApiKeyWithCount[]>;
  findById(id: string): Promise<BolnaApiKey | null>;
  deactivate(id: string): Promise<BolnaApiKey>;

  // ── Lifecycle ─────────────────────────────────────────────────
  reassignTenantsFromKey(keyId: string): Promise<number>;
  findTenantIdsUsingKey(keyId: string): Promise<string[]>;
}
