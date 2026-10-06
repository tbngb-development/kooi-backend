import type { BolnaApiKey, BolnaApiKeyType } from "@prisma/client";

export interface CreateBolnaApiKeyData {
  keyIdentifier: string;
  encryptedKey: string;
  type: BolnaApiKeyType;
  isPlatformDefault: boolean;
  createdBy: string;
}

export interface BolnaApiKeyWithCount extends BolnaApiKey {
  _count: { tenants: number };
}

export interface KeyTenantListResult {
  tenants: Array<{
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    workspaceSwitchStatus: string;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BolnaApiKeyRepository {
  // ── Runtime resolution ─────────────────────────────────
  findKeyForTenant(tenantId?: string | null): Promise<BolnaApiKey | null>;
  updateLastAccessed(keyId: string): Promise<void>;

  // ── Assignment ─────────────────────────────────────────
  assignLeastLoadedKeyToTenant(tenantId: string): Promise<BolnaApiKey>;
  assignKeyToTenant(tenantId: string, keyId: string): Promise<void>;

  // ── Admin CRUD ─────────────────────────────────────────
  create(data: CreateBolnaApiKeyData): Promise<BolnaApiKey>;
  list(): Promise<BolnaApiKeyWithCount[]>;
  findById(id: string): Promise<BolnaApiKey | null>;
  deactivate(id: string): Promise<BolnaApiKey>;

  // ── NEW: Profile management ────────────────────────────
  updateProfile(
    keyId: string,
    profile: {
      bolnaProfileName: string | null;
      bolnaProfileEmail: string | null;
      bolnaWalletBalance: number | null;
      bolnaConcurrencyMax: number | null;
      bolnaConcurrencyCurrent: number | null;
      bolnaProfileFetchedAt: Date;
    },
  ): Promise<void>;

  // ── NEW: Key metadata update ───────────────────────────
  updateKey(
    keyId: string,
    data: {
      keyIdentifier?: string;
      encryptedKey?: string;
      type?: BolnaApiKeyType;
    },
  ): Promise<void>;

  // ── NEW: Lifecycle ─────────────────────────────────────
  activate(keyId: string): Promise<void>;

  // ── NEW: Tenant listing ────────────────────────────────
  listTenantsForKey(
    keyId: string,
    options: { page: number; limit: number; search?: string },
  ): Promise<KeyTenantListResult>;

  // ── Existing lifecycle helpers ─────────────────────────
  reassignTenantsFromKey(keyId: string): Promise<number>;
  findTenantIdsUsingKey(keyId: string): Promise<string[]>;
}
