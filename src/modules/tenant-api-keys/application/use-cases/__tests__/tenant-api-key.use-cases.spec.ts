import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateTenantApiKeyUseCase } from "../create-tenant-api-key.use-case";
import { ListTenantApiKeysUseCase } from "../list-tenant-api-keys.use-case";
import { DeleteTenantApiKeyUseCase } from "../delete-tenant-api-key.use-case";
import { VerifyTenantApiKeyUseCase } from "../verify-tenant-api-key.use-case";
import type { ITenantApiKeyRepository } from "../../interfaces/tenant-api-key-repository.interface";
import type { IApiKeyCryptoService } from "../../../infrastructure/services/api-key-crypto.service";
import type { TenantApiKeyEntity } from "../../../domain/entities/tenant-api-key.entity";
import { NotFoundError } from "../../../../../shared/errors/not-found.error";
import { UnauthorizedError } from "../../../../../shared/errors/unauthorized.error";
import { ForbiddenError } from "../../../../../shared/errors/forbidden.error";

describe("Tenant API Key Use Cases", () => {
  let mockRepo: ITenantApiKeyRepository;
  let mockCrypto: IApiKeyCryptoService;

  const mockTenant = {
    id: "tenant-123",
    name: "Acme Corp",
    isActive: true,
  };

  const mockUser = {
    id: "user-456",
    name: "Jane Founder",
    email: "jane@acme.com",
  };

  const createMockEntity = (
    overrides?: Partial<TenantApiKeyEntity>,
  ): TenantApiKeyEntity => ({
    id: "key-uuid-1",
    keyIdentifier: "ki-1111-2222-3333-4444",
    secretHash: "mock-sha256-hash-value",
    tenantId: "tenant-123",
    createdBy: "user-456",
    lastAccessedAt: null,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    createdByUser: mockUser,
    tenant: mockTenant,
    ...overrides,
  });

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findByKeyIdentifier: vi.fn(),
      findByIdAndTenantId: vi.fn(),
      listByTenantId: vi.fn(),
      deleteByIdAndTenantId: vi.fn(),
      updateLastAccessedAt: vi.fn().mockResolvedValue(undefined),
    };

    mockCrypto = {
      generateKey: vi.fn().mockReturnValue({
        keyIdentifier: "ki-1111-2222-3333-4444",
        secret: "sec_abc123secret",
        fullKey: "ki-1111-2222-3333-4444.sec_abc123secret",
        secretHash: "mock-sha256-hash-value",
      }),
      hashSecret: vi.fn().mockReturnValue("mock-sha256-hash-value"),
      verifySecret: vi.fn().mockReturnValue(true),
    };
  });

  describe("CreateTenantApiKeyUseCase", () => {
    it("should generate key, store hash in repository, and return one-time creation DTO with fullKey", async () => {
      const entity = createMockEntity();
      vi.mocked(mockRepo.create).mockResolvedValue(entity);

      const useCase = new CreateTenantApiKeyUseCase(mockRepo, mockCrypto);
      const result = await useCase.execute(
        "tenant-123",
        "user-456",
      );

      expect(mockCrypto.generateKey).toHaveBeenCalledTimes(1);
      expect(mockRepo.create).toHaveBeenCalledWith({
        keyIdentifier: "ki-1111-2222-3333-4444",
        secretHash: "mock-sha256-hash-value",
        tenantId: "tenant-123",
        createdBy: "user-456",
      });

      expect(result.id).toBe("key-uuid-1");
      expect(result.keyIdentifier).toBe("ki-1111-2222-3333-4444");
      expect(result.fullKey).toBe("ki-1111-2222-3333-4444.sec_abc123secret");
      expect(result.createdBy).toEqual({
        id: "user-456",
        name: "Jane Founder",
        email: "jane@acme.com",
      });
      // CRITICAL: Ensure secretHash is NEVER leaked
      expect((result as unknown as Record<string, unknown>).secretHash).toBeUndefined();
    });
  });

  describe("ListTenantApiKeysUseCase", () => {
    it("should list tenant API keys with masked keys and pagination metadata", async () => {
      const entity1 = createMockEntity({ id: "key-1" });
      const entity2 = createMockEntity({
        id: "key-2",
        keyIdentifier: "ki-5555-6666-7777-8888",
        lastAccessedAt: new Date("2026-10-15T12:00:00Z"),
      });

      vi.mocked(mockRepo.listByTenantId).mockResolvedValue({
        items: [entity1, entity2],
        total: 2,
      });

      const useCase = new ListTenantApiKeysUseCase(mockRepo);
      const result = await useCase.execute("tenant-123", 1, 20);

      expect(mockRepo.listByTenantId).toHaveBeenCalledWith("tenant-123", 1, 20);
      expect(result.items.length).toBe(2);
      expect(result.items[0].maskedKey).toBe("ki-1111-2222-3333-4444.sec_••••••••");
      expect(result.items[1].maskedKey).toBe("ki-5555-6666-7777-8888.sec_••••••••");
      expect(result.items[1].lastAccessedAt).toBe("2026-10-15T12:00:00.000Z");
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      // Verify no plain secret or hash leaks in list response
      expect((result.items[0] as unknown as Record<string, unknown>).fullKey).toBeUndefined();
      expect((result.items[0] as unknown as Record<string, unknown>).secretHash).toBeUndefined();
    });
  });

  describe("DeleteTenantApiKeyUseCase", () => {
    it("should permanently delete key when matching tenant", async () => {
      vi.mocked(mockRepo.deleteByIdAndTenantId).mockResolvedValue(true);

      const useCase = new DeleteTenantApiKeyUseCase(mockRepo);
      await expect(
        useCase.execute("key-uuid-1", "tenant-123", "user-456"),
      ).resolves.not.toThrow();

      expect(mockRepo.deleteByIdAndTenantId).toHaveBeenCalledWith(
        "key-uuid-1",
        "tenant-123",
      );
    });

    it("should throw NotFoundError when key does not exist or belongs to another tenant", async () => {
      vi.mocked(mockRepo.deleteByIdAndTenantId).mockResolvedValue(false);

      const useCase = new DeleteTenantApiKeyUseCase(mockRepo);
      await expect(
        useCase.execute("foreign-key-id", "tenant-123", "user-456"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("VerifyTenantApiKeyUseCase", () => {
    it("should verify valid key and trigger lastAccessedAt update when never accessed", async () => {
      const entity = createMockEntity({ lastAccessedAt: null });
      vi.mocked(mockRepo.findByKeyIdentifier).mockResolvedValue(entity);
      vi.mocked(mockCrypto.verifySecret).mockReturnValue(true);

      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      const verified = await useCase.execute(
        "ki-1111-2222-3333-4444.sec_abc123secret",
      );

      expect(verified.id).toBe("key-uuid-1");
      expect(mockRepo.findByKeyIdentifier).toHaveBeenCalledWith(
        "ki-1111-2222-3333-4444",
      );
      expect(mockCrypto.verifySecret).toHaveBeenCalledWith(
        "sec_abc123secret",
        "mock-sha256-hash-value",
      );
      expect(mockRepo.updateLastAccessedAt).toHaveBeenCalledTimes(1);
    });

    it("should reject key without dot delimiter", async () => {
      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await expect(useCase.execute("invalidkeywithoutdot")).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it("should reject key without ki- prefix", async () => {
      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await expect(
        useCase.execute("bad-prefix.sec_abc123secret"),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should reject non-existent keyIdentifier", async () => {
      vi.mocked(mockRepo.findByKeyIdentifier).mockResolvedValue(null);

      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await expect(
        useCase.execute("ki-unknown.sec_abc123secret"),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should reject key when secret does not match hash", async () => {
      const entity = createMockEntity();
      vi.mocked(mockRepo.findByKeyIdentifier).mockResolvedValue(entity);
      vi.mocked(mockCrypto.verifySecret).mockReturnValue(false);

      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await expect(
        useCase.execute("ki-1111-2222-3333-4444.sec_wrongsecret"),
      ).rejects.toThrow(UnauthorizedError);
    });

    it("should reject key when tenant is inactive", async () => {
      const entity = createMockEntity({
        tenant: { id: "tenant-123", name: "Acme", isActive: false },
      });
      vi.mocked(mockRepo.findByKeyIdentifier).mockResolvedValue(entity);
      vi.mocked(mockCrypto.verifySecret).mockReturnValue(true);

      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await expect(
        useCase.execute("ki-1111-2222-3333-4444.sec_abc123secret"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throttle lastAccessedAt update when accessed recently (< 60s)", async () => {
      const recentTimestamp = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const entity = createMockEntity({ lastAccessedAt: recentTimestamp });
      vi.mocked(mockRepo.findByKeyIdentifier).mockResolvedValue(entity);
      vi.mocked(mockCrypto.verifySecret).mockReturnValue(true);

      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await useCase.execute("ki-1111-2222-3333-4444.sec_abc123secret");

      expect(mockRepo.updateLastAccessedAt).not.toHaveBeenCalled();
    });

    it("should update lastAccessedAt when accessed more than 60s ago", async () => {
      const oldTimestamp = new Date(Date.now() - 120 * 1000); // 120 seconds ago
      const entity = createMockEntity({ lastAccessedAt: oldTimestamp });
      vi.mocked(mockRepo.findByKeyIdentifier).mockResolvedValue(entity);
      vi.mocked(mockCrypto.verifySecret).mockReturnValue(true);

      const useCase = new VerifyTenantApiKeyUseCase(mockRepo, mockCrypto);
      await useCase.execute("ki-1111-2222-3333-4444.sec_abc123secret");

      expect(mockRepo.updateLastAccessedAt).toHaveBeenCalledTimes(1);
    });
  });
});
