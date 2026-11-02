import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateSarvamConfigurationUseCase } from "../application/use-cases/create-sarvam-configuration.use-case";
import { UpdateSarvamConfigurationUseCase } from "../application/use-cases/update-sarvam-configuration.use-case";
import { GetSarvamConfigurationUseCase } from "../application/use-cases/get-sarvam-configuration.use-case";
import { ListSarvamConfigurationsUseCase } from "../application/use-cases/list-sarvam-configurations.use-case";
import { DeleteSarvamConfigurationUseCase } from "../application/use-cases/delete-sarvam-configuration.use-case";
import { SarvamConfigurationMapper } from "../application/mappers/sarvam-configuration.mapper";
import type {
  ISarvamConfigurationRepository,
  SarvamConfigurationWithTenant,
} from "../application/interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "../application/interfaces/sarvam-encryption-service.interface";
import {
  TenantNotFoundError,
  SarvamConfigurationConflictError,
  SarvamConfigurationNotFoundError,
} from "../domain/errors/sarvam-configuration.errors";

describe("Sarvam Configuration Use Cases", () => {
  let mockRepo: ISarvamConfigurationRepository;
  let mockEncryptionService: ISarvamEncryptionService;
  let mapper: SarvamConfigurationMapper;

  const mockTenant = {
    id: "tenant-uuid-1",
    name: "Acme Corp",
    email: "admin@acme.com",
    isActive: true,
  };

  const sampleRecord: SarvamConfigurationWithTenant = {
    id: "config-uuid-1",
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

    mapper = new SarvamConfigurationMapper(mockEncryptionService);
  });

  describe("CreateSarvamConfigurationUseCase", () => {
    it("should successfully create a new configuration and encrypt the API key", async () => {
      vi.mocked(mockRepo.tenantExists).mockResolvedValue(true);
      vi.mocked(mockRepo.existsForTenant).mockResolvedValue(false);
      vi.mocked(mockRepo.create).mockResolvedValue(sampleRecord);

      const useCase = new CreateSarvamConfigurationUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      const result = await useCase.execute({
        tenantId: "tenant-uuid-1",
        apiKey: "sk_live_sample_key_9999",
        workspaceId: "wrk-123",
        organizationId: "org-456",
        createdBy: "admin-user-1",
      });

      expect(mockRepo.tenantExists).toHaveBeenCalledWith("tenant-uuid-1");
      expect(mockRepo.existsForTenant).toHaveBeenCalledWith("tenant-uuid-1");
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(
        "sk_live_sample_key_9999",
      );
      expect(mockRepo.create).toHaveBeenCalledWith({
        tenantId: "tenant-uuid-1",
        apiKeyEncrypted: "enc_sk_live_sample_key_9999",
        workspaceId: "wrk-123",
        organizationId: "org-456",
        isActive: true,
        createdBy: "admin-user-1",
      });
      expect(result.maskedApiKey).toBe("sk_••••••••9999");
      expect(result.tenantName).toBe("Acme Corp");
    });

    it("should throw TenantNotFoundError if tenant does not exist", async () => {
      vi.mocked(mockRepo.tenantExists).mockResolvedValue(false);

      const useCase = new CreateSarvamConfigurationUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await expect(
        useCase.execute({
          tenantId: "nonexistent-tenant",
          apiKey: "sk_test_key",
          workspaceId: "wrk-1",
          organizationId: "org-1",
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(TenantNotFoundError);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("should throw SarvamConfigurationConflictError if configuration already exists for tenant", async () => {
      vi.mocked(mockRepo.tenantExists).mockResolvedValue(true);
      vi.mocked(mockRepo.existsForTenant).mockResolvedValue(true);

      const useCase = new CreateSarvamConfigurationUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-uuid-1",
          apiKey: "sk_test_key",
          workspaceId: "wrk-1",
          organizationId: "org-1",
          createdBy: "admin-1",
        }),
      ).rejects.toThrow(SarvamConfigurationConflictError);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("UpdateSarvamConfigurationUseCase", () => {
    it("should preserve existing API key when apiKey is undefined or empty string", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);
      vi.mocked(mockRepo.update).mockResolvedValue({
        ...sampleRecord,
        workspaceId: "wrk-new",
        updatedBy: "admin-2",
      });

      const useCase = new UpdateSarvamConfigurationUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      const result = await useCase.execute({
        id: "config-uuid-1",
        workspaceId: "wrk-new",
        updatedBy: "admin-2",
      });

      expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith("config-uuid-1", {
        workspaceId: "wrk-new",
        updatedBy: "admin-2",
      });
      expect(result.workspaceId).toBe("wrk-new");
    });

    it("should update encrypted API key when a new non-empty apiKey is provided", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);
      vi.mocked(mockRepo.update).mockResolvedValue({
        ...sampleRecord,
        apiKeyEncrypted: "enc_new_key",
        updatedBy: "admin-2",
      });

      const useCase = new UpdateSarvamConfigurationUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await useCase.execute({
        id: "config-uuid-1",
        apiKey: "new_plain_key",
        updatedBy: "admin-2",
      });

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith("new_plain_key");
      expect(mockRepo.update).toHaveBeenCalledWith("config-uuid-1", {
        apiKeyEncrypted: "enc_new_plain_key",
        updatedBy: "admin-2",
      });
    });

    it("should throw SarvamConfigurationNotFoundError when updating non-existent config", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const useCase = new UpdateSarvamConfigurationUseCase(
        mockRepo,
        mockEncryptionService,
        mapper,
      );

      await expect(
        useCase.execute({
          id: "missing-id",
          workspaceId: "wrk-updated",
          updatedBy: "admin-1",
        }),
      ).rejects.toThrow(SarvamConfigurationNotFoundError);
    });
  });

  describe("GetSarvamConfigurationUseCase", () => {
    it("should retrieve configuration details with masked key", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);

      const useCase = new GetSarvamConfigurationUseCase(mockRepo, mapper);
      const result = await useCase.execute("config-uuid-1");

      expect(result.id).toBe("config-uuid-1");
      expect(result.maskedApiKey).toBe("sk_••••••••9999");
      expect(result.tenantName).toBe("Acme Corp");
    });

    it("should throw SarvamConfigurationNotFoundError if not found", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const useCase = new GetSarvamConfigurationUseCase(mockRepo, mapper);
      await expect(useCase.execute("missing-id")).rejects.toThrow(
        SarvamConfigurationNotFoundError,
      );
    });
  });

  describe("ListSarvamConfigurationsUseCase", () => {
    it("should return paginated list of configurations", async () => {
      vi.mocked(mockRepo.list).mockResolvedValue({
        items: [sampleRecord],
        total: 1,
      });

      const useCase = new ListSarvamConfigurationsUseCase(mockRepo, mapper);
      const result = await useCase.execute({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.items[0].maskedApiKey).toBe("sk_••••••••9999");
    });
  });

  describe("DeleteSarvamConfigurationUseCase", () => {
    it("should delete existing configuration", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(sampleRecord);
      vi.mocked(mockRepo.delete).mockResolvedValue(undefined);

      const useCase = new DeleteSarvamConfigurationUseCase(mockRepo);
      await useCase.execute("config-uuid-1", "admin-1");

      expect(mockRepo.delete).toHaveBeenCalledWith("config-uuid-1");
    });

    it("should throw SarvamConfigurationNotFoundError if configuration to delete is missing", async () => {
      vi.mocked(mockRepo.findById).mockResolvedValue(null);

      const useCase = new DeleteSarvamConfigurationUseCase(mockRepo);
      await expect(useCase.execute("missing-id")).rejects.toThrow(
        SarvamConfigurationNotFoundError,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
