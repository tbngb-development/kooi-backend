import { describe, it, expect, beforeEach, vi } from "vitest";
import { SarvamCredentialService } from "../application/services/sarvam-credential.service";
import type {
  ISarvamConfigurationRepository,
  SarvamConfigurationWithTenant,
} from "../application/interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "../application/interfaces/sarvam-encryption-service.interface";
import {
  SarvamConfigurationNotFoundError,
  SarvamConfigurationInactiveError,
} from "../domain/errors/sarvam-configuration.errors";

describe("SarvamCredentialService (Internal Service)", () => {
  let mockRepo: ISarvamConfigurationRepository;
  let mockEncryptionService: ISarvamEncryptionService;
  let service: SarvamCredentialService;

  const activeRecord: SarvamConfigurationWithTenant = {
    id: "config-uuid-1",
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

    service = new SarvamCredentialService(mockRepo, mockEncryptionService);
  });

  it("should return decrypted credentials for an active tenant", async () => {
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue(activeRecord);

    const creds = await service.getSarvamCredentials("tenant-uuid-1");

    expect(mockRepo.findByTenantId).toHaveBeenCalledWith("tenant-uuid-1");
    expect(mockEncryptionService.decrypt).toHaveBeenCalledWith("enc_key_data");
    expect(creds).toEqual({
      tenantId: "tenant-uuid-1",
      apiKey: "sk_live_decrypted_sarvam_key",
      workspaceId: "wrk-123",
      organizationId: "org-456",
      isActive: true,
    });
  });

  it("should throw SarvamConfigurationInactiveError when configuration is inactive", async () => {
    const inactiveRecord = { ...activeRecord, isActive: false };
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue(inactiveRecord);

    await expect(
      service.getSarvamCredentials("tenant-uuid-1"),
    ).rejects.toThrow(SarvamConfigurationInactiveError);

    expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
  });

  it("should throw SarvamConfigurationNotFoundError when tenant has no configuration", async () => {
    vi.mocked(mockRepo.findByTenantId).mockResolvedValue(null);

    await expect(
      service.getSarvamCredentials("unconfigured-tenant"),
    ).rejects.toThrow(SarvamConfigurationNotFoundError);
  });

  it("should throw SarvamConfigurationNotFoundError when tenantId is empty or blank", async () => {
    await expect(service.getSarvamCredentials("   ")).rejects.toThrow(
      SarvamConfigurationNotFoundError,
    );
    expect(mockRepo.findByTenantId).not.toHaveBeenCalled();
  });
});

