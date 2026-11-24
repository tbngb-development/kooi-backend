import { describe, it, expect, beforeEach, vi } from "vitest";
import { SarvamApiKeyService } from "../application/services/sarvam-api-key.service";
import type {
  ISarvamApiKeyRepository,
  SarvamApiKeyWithTenant,
} from "../application/interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "../application/interfaces/sarvam-api-key-encryption.interface";
import {
  SarvamApiKeyNotFoundError,
  SarvamApiKeyInactiveError,
} from "../domain/errors/sarvam-api-key.errors";

describe("SarvamApiKeyService (Internal Service)", () => {
  let mockRepo: ISarvamApiKeyRepository;
  let mockEncryptionService: ISarvamApiKeyEncryptionService;
  let service: SarvamApiKeyService;

  const activeRecord: SarvamApiKeyWithTenant = {
    id: "key-uuid-1",
    tenantId: "tenant-uuid-1",
    apiKeyEncrypted: "enc_key_data",
    workspaceId: "wrk-123",
    organizationId: "org-456",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin-1",
    updatedBy: null,
    tenant: {
      id: "tenant-uuid-1",
      name: "Acme",
      email: "acme@test.com",
      isActive: true,
    },
  };

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      existsForTenant: vi.fn(),
      tenantExists: vi.fn(),
    };

    mockEncryptionService = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => "sk_live_decrypted_sarvam_key"),
      maskKey: vi.fn(),
    };

    service = new SarvamApiKeyService(mockRepo, mockEncryptionService);
  });

  it("should return decrypted credentials for an active tenant via getSarvamApiKey", async () => {
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue(activeRecord);

    const result = await service.getSarvamApiKey("tenant-uuid-1");

    expect(mockRepo.findByTenantId).toHaveBeenCalledWith("tenant-uuid-1");
    expect(mockEncryptionService.decrypt).toHaveBeenCalledWith("enc_key_data");
    expect(result).toEqual({
      tenantId: "tenant-uuid-1",
      apiKey: "sk_live_decrypted_sarvam_key",
      workspaceId: "wrk-123",
      organizationId: "org-456",
      isActive: true,
    });
  });

  it("should return decrypted credentials via backward-compatible getSarvamCredentials alias", async () => {
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue(activeRecord);

    const result = await service.getSarvamCredentials("tenant-uuid-1");

    expect(result.apiKey).toBe("sk_live_decrypted_sarvam_key");
  });

  it("should throw SarvamApiKeyNotFoundError when tenant has no key configured", async () => {
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue(null);

    await expect(service.getSarvamApiKey("unknown-tenant")).rejects.toThrow(
      SarvamApiKeyNotFoundError,
    );
  });

  it("should throw SarvamApiKeyInactiveError when tenant key is inactive", async () => {
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue({
      ...activeRecord,
      isActive: false,
    });

    await expect(service.getSarvamApiKey("tenant-uuid-1")).rejects.toThrow(
      SarvamApiKeyInactiveError,
    );
    expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
  });

  it("should throw SarvamApiKeyNotFoundError when tenantId is empty or whitespace", async () => {
    await expect(service.getSarvamApiKey("   ")).rejects.toThrow(
      SarvamApiKeyNotFoundError,
    );
  });
});

