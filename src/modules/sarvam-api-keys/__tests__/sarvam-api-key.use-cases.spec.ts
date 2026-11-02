import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateSarvamApiKeyUseCase } from "../application/use-cases/create-sarvam-api-key.use-case";
import { UpdateSarvamApiKeyUseCase } from "../application/use-cases/update-sarvam-api-key.use-case";
import { GetSarvamApiKeyUseCase } from "../application/use-cases/get-sarvam-api-key.use-case";
import { ListSarvamApiKeysUseCase } from "../application/use-cases/list-sarvam-api-keys.use-case";
import { DeleteSarvamApiKeyUseCase } from "../application/use-cases/delete-sarvam-api-key.use-case";
import { SarvamApiKeyMapper } from "../application/mappers/sarvam-api-key.mapper";
import type {
  ISarvamApiKeyRepository,
  SarvamApiKeyWithTenant,
} from "../application/interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "../application/interfaces/sarvam-api-key-encryption.interface";
import {
  TenantNotFoundError,
  SarvamApiKeyConflictError,
  SarvamApiKeyNotFoundError,
} from "../domain/errors/sarvam-api-key.errors";

describe("Sarvam API Key Use Cases", () => {
  let mockRepo: ISarvamApiKeyRepository;
  let mockEncryptionService: ISarvamApiKeyEncryptionService;
  let mapper: SarvamApiKeyMapper;

  const mockTenant = {
    id: "tenant-uuid-1",
    name: "Acme Corp",
    email: "admin@acme.com",
    isActive: true,
  };

  const sampleRecord: SarvamApiKeyWithTenant = {
    id: "key-uuid-1",
    tenantId: "tenant-uuid-1",
    apiKeyEncrypted: "encrypted:tag:ciphertext",
    workspaceId: "wrk-123",
    organizationId: "org-456",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: "admin-user-1",
    updatedBy: null,
    tenant: mockTenant,
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
      encrypt: vi.fn((key: string) => `enc_${key}`),
      decrypt: vi.fn(() => "sk_live_sample_key_9999"),
      maskKey: vi.fn(() => "sk_••••••••9999"),
    };

    mapper = new SarvamApiKeyMapper(mockEncryptionService);
  });

  describe("CreateSarvamApiKeyUseCase", () => {
    it("should create a new sarvam api key successfully", async () => {
      vi.mocked(mockRepo.tenantExists).mockResolvedValue(true);
      vi.mocked(mockRepo.existsForTenant).mockResolvedValue(false);
      vi.mocked(mockRepo.create).mockResolvedValue(sampleRecord);

      const useCase = new CreateSarvamApiKeyUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      const result = await useCase.execute({
        tenantId: "tenant-uuid-1",
        apiKey: "sk_live_super_secret_1234",
        workspaceId: "wrk-123",
        organizationId: "org-456",
        isActive: true,
        createdBy: "admin-user-1",
      });

      expect(mockRepo.tenantExists).toHaveBeenCalledWith("tenant-uuid-1");
      expect(mockRepo.existsForTenant).toHaveBeenCalledWith("tenant-uuid-1");
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(
        "sk_live_super_secret_1234",
      );
      expect(mockRepo.create).toHaveBeenCalledWith({
        tenantId: "tenant-uuid-1",
        apiKeyEncrypted: "enc_sk_live_super_secret_1234",
        workspaceId: "wrk-123",
        organizationId: "org-456",
        isActive: true,
        createdBy: "admin-user-1",
      });
      expect(result.id).toBe("key-uuid-1");
      expect(result.maskedApiKey).toBe("sk_••••••••9999");
      expect(result).not.toHaveProperty("apiKey");
      expect(result).not.toHaveProperty("apiKeyEncrypted");
    });

    it("should throw TenantNotFoundError if tenant does not exist", async () => {
      vi.mocked(mockRepo.tenantExists).mockResolvedValue(false);

      const useCase = new CreateSarvamApiKeyUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await expect(
        useCase.execute({
          tenantId: "invalid-tenant",
          apiKey: "sk_test_123",
          workspaceId: "wrk-1",
          organizationId: "org-1",
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(TenantNotFoundError);

      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("should throw SarvamApiKeyConflictError if tenant already has a key", async () => {
      vi.mocked(mockRepo.tenantExists).mockResolvedValue(true);
      vi.mocked(mockRepo.existsForTenant).mockResolvedValue(true);

      const useCase = new CreateSarvamApiKeyUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-uuid-1",
          apiKey: "sk_test_123",
          workspaceId: "wrk-1",
          organizationId: "org-1",
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(SarvamApiKeyConflictError);

      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("UpdateSarvamApiKeyUseCase", () => {
    it("should update metadata and keep existing api key when apiKey is omitted", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);
      vi.mocked(mockRepo.update).mockResolvedValue({
        ...sampleRecord,
        workspaceId: "updated-wrk",
      });

      const useCase = new UpdateSarvamApiKeyUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      const result = await useCase.execute({
        id: "key-uuid-1",
        workspaceId: "updated-wrk",
        updatedBy: "admin-editor",
      });

      expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith("key-uuid-1", {
        workspaceId: "updated-wrk",
        updatedBy: "admin-editor",
      });
      expect(result.workspaceId).toBe("updated-wrk");
    });

    it("should update and re-encrypt api key when a new apiKey is provided", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);
      vi.mocked(mockRepo.update).mockResolvedValue({
        ...sampleRecord,
        apiKeyEncrypted: "enc_new_plain_key_4567",
      });

      const useCase = new UpdateSarvamApiKeyUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await useCase.execute({
        id: "key-uuid-1",
        apiKey: "new_plain_key_4567",
        updatedBy: "admin-editor",
      });

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(
        "new_plain_key_4567",
      );
      expect(mockRepo.update).toHaveBeenCalledWith("key-uuid-1", {
        apiKeyEncrypted: "enc_new_plain_key_4567",
        updatedBy: "admin-editor",
      });
    });

    it("should throw SarvamApiKeyNotFoundError when updating non-existent key", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const useCase = new UpdateSarvamApiKeyUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await expect(
        useCase.execute({
          id: "non-existent-id",
          isActive: false,
          updatedBy: "admin",
        }),
      ).rejects.toThrow(SarvamApiKeyNotFoundError);
    });
  });

  describe("GetSarvamApiKeyUseCase", () => {
    it("should return the key with masked apiKey", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);

      const useCase = new GetSarvamApiKeyUseCase(mockRepo, mapper);
      const result = await useCase.execute("key-uuid-1");

      expect(result.id).toBe("key-uuid-1");
      expect(result.maskedApiKey).toBe("sk_••••••••9999");
      expect(result).not.toHaveProperty("apiKey");
      expect(result).not.toHaveProperty("apiKeyEncrypted");
    });

    it("should throw SarvamApiKeyNotFoundError when key not found", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const useCase = new GetSarvamApiKeyUseCase(mockRepo, mapper);
      await expect(useCase.execute("missing-id")).rejects.toThrow(
        SarvamApiKeyNotFoundError,
      );
    });
  });

  describe("ListSarvamApiKeysUseCase", () => {
    it("should list paginated keys and mask every api key", async () => {
      vi.mocked(mockRepo.list).mockResolvedValue({
        items: [sampleRecord],
        total: 1,
      });

      const useCase = new ListSarvamApiKeysUseCase(mockRepo, mapper);
      const result = await useCase.execute({
        page: 1,
        limit: 10,
        search: "Acme",
      });

      expect(result.pagination.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].maskedApiKey).toBe("sk_••••••••9999");
      expect(result.items[0]).not.toHaveProperty("apiKeyEncrypted");
    });
  });

  describe("DeleteSarvamApiKeyUseCase", () => {
    it("should delete existing key record", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);
      vi.mocked(mockRepo.delete).mockResolvedValue();

      const useCase = new DeleteSarvamApiKeyUseCase(mockRepo);
      await useCase.execute("key-uuid-1", "admin-deleter");

      expect(mockRepo.findById).toHaveBeenCalledWith("key-uuid-1");
      expect(mockRepo.delete).toHaveBeenCalledWith("key-uuid-1");
    });

    it("should throw SarvamApiKeyNotFoundError when deleting non-existent key", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const useCase = new DeleteSarvamApiKeyUseCase(mockRepo);
      await expect(
        useCase.execute("missing-id", "admin-deleter"),
      ).rejects.toThrow(SarvamApiKeyNotFoundError);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
