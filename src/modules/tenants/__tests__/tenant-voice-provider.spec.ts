import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantVoiceProviderService } from "../application/services/tenant-voice-provider.service";
import { UpdateTenantUseCase } from "../application/use-cases/update-tenant.use-case";
import { TenantWorkspaceController } from "../presentation/tenant-workspace.controller";
import {
  MissingVoiceProviderCredentialError,
  InactiveVoiceProviderCredentialError,
  TenantNotFoundError,
} from "../domain/tenant.errors";
import { adminUpdateTenantSchema, updateWorkspaceSchema } from "../presentation/tenant.schema";
import type {
  TenantRepository,
  TenantWithCounts,
} from "../application/interfaces/tenant-repository.interface";
import type { BolnaApiKeyRepository } from "../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import type { ISarvamApiKeyRepository } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-repository.interface";

describe("Tenant Voice Provider Configuration & Switching", () => {
  let mockTenantRepo: TenantRepository;
  let mockBolnaRepo: BolnaApiKeyRepository;
  let mockSarvamRepo: ISarvamApiKeyRepository;
  let service: TenantVoiceProviderService;
  let updateUseCase: UpdateTenantUseCase;

  const mockActiveBolnaKey = {
    id: "bolna-key-1",
    keyIdentifier: "bolna_live_****1111",
    encryptedKey: "enc_bolna_secret",
    type: "GENERAL" as const,
    isPlatformDefault: true,
    isActive: true,
    createdBy: "admin-1",
    lastAccessedAt: null,
    bolnaProfileName: "Production Bolna",
    bolnaProfileEmail: "ops@acme.com",
    bolnaWalletBalance: 200,
    bolnaConcurrencyMax: 10,
    bolnaConcurrencyCurrent: 2,
    bolnaProfileFetchedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockInactiveBolnaKey = {
    ...mockActiveBolnaKey,
    id: "bolna-key-inactive",
    keyIdentifier: "bolna_inactive_****0000",
    isActive: false,
  };

  const mockActiveSarvamKey = {
    id: "sarvam-key-1",
    tenantId: "tenant-001",
    apiKeyEncrypted: "enc_sarvam_secret",
    workspaceId: "sarvam-ws-123",
    organizationId: "sarvam-org-456",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "admin-1",
    updatedBy: null,
    tenant: {
      id: "tenant-001",
      name: "Acme Voice Labs",
      email: "billing@acme.com",
      isActive: true,
    },
  };

  const mockInactiveSarvamKey = {
    ...mockActiveSarvamKey,
    id: "sarvam-key-inactive",
    isActive: false,
  };

  const baseTenant: TenantWithCounts = {
    id: "tenant-001",
    name: "Acme Voice Labs",
    email: "billing@acme.com",
    isActive: true,
    voiceProvider: "BOLNA",
    bolnaApiKeyId: "bolna-key-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { memberships: 2, campaigns: 1, leads: 50, calls: 30 },
    bolnaApiKey: {
      id: "bolna-key-1",
      keyIdentifier: "bolna_live_****1111",
      type: "GENERAL",
      isActive: true,
      bolnaProfileName: "Production Bolna",
      bolnaProfileEmail: "ops@acme.com",
      bolnaWalletBalance: 200,
      bolnaConcurrencyMax: 10,
      bolnaConcurrencyCurrent: 2,
      bolnaProfileFetchedAt: new Date(),
    },
    sarvamApiKey: {
      id: "sarvam-key-1",
      workspaceId: "sarvam-ws-123",
      organizationId: "sarvam-org-456",
      isActive: true,
      createdAt: new Date(),
    },
  };

  beforeEach(() => {
    mockTenantRepo = {
      list: vi.fn().mockResolvedValue([baseTenant]),
      findById: vi.fn().mockResolvedValue({ ...baseTenant }),
      update: vi.fn().mockImplementation((id, data) =>
        Promise.resolve({ ...baseTenant, ...data }),
      ),
      getStats: vi.fn(),
    };

    mockBolnaRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === "bolna-key-1") return mockActiveBolnaKey as any;
        if (id === "bolna-key-inactive") return mockInactiveBolnaKey as any;
        return null;
      }),
      findKeyForTenant: vi.fn(),
      updateLastAccessed: vi.fn(),
      assignLeastLoadedKeyToTenant: vi.fn(),
      assignKeyToTenant: vi.fn(),
      reassignTenantsFromKey: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as BolnaApiKeyRepository;

    mockSarvamRepo = {
      findByTenantId: vi.fn().mockImplementation(async (tenantId: string) => {
        if (tenantId === "tenant-001") return mockActiveSarvamKey as any;
        return null;
      }),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      existsForTenant: vi.fn(),
      tenantExists: vi.fn(),
    };

    service = new TenantVoiceProviderService(
      mockTenantRepo,
      mockBolnaRepo,
      mockSarvamRepo,
    );

    updateUseCase = new UpdateTenantUseCase(mockTenantRepo, service);
  });

  describe("TenantVoiceProviderService - Runtime Credential Resolution", () => {
    it("should resolve active BOLNA credential when tenant.voiceProvider is BOLNA", async () => {
      const result = await service.resolveActiveProvider("tenant-001");
      expect(result.provider).toBe("BOLNA");
      expect(result.credential.id).toBe("bolna-key-1");
      expect(result.credential.isActive).toBe(true);
      expect(result.credential.metadata?.keyIdentifier).toBe("bolna_live_****1111");
    });

    it("should resolve active SARVAM credential when tenant.voiceProvider is SARVAM", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce({
        ...baseTenant,
        voiceProvider: "SARVAM",
      });

      const result = await service.resolveActiveProvider("tenant-001");
      expect(result.provider).toBe("SARVAM");
      expect(result.credential.id).toBe("sarvam-key-1");
      expect(result.credential.isActive).toBe(true);
      expect(result.credential.metadata?.workspaceId).toBe("sarvam-ws-123");
    });

    it("should throw MissingVoiceProviderCredentialError if BOLNA key is missing and NEVER fall back to SARVAM", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce({
        ...baseTenant,
        voiceProvider: "BOLNA",
        bolnaApiKeyId: null,
      });

      await expect(service.resolveActiveProvider("tenant-001")).rejects.toThrow(
        MissingVoiceProviderCredentialError,
      );
    });

    it("should throw InactiveVoiceProviderCredentialError if BOLNA key is inactive and NEVER fall back to SARVAM", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce({
        ...baseTenant,
        voiceProvider: "BOLNA",
        bolnaApiKeyId: "bolna-key-inactive",
      });

      await expect(service.resolveActiveProvider("tenant-001")).rejects.toThrow(
        InactiveVoiceProviderCredentialError,
      );
    });

    it("should throw MissingVoiceProviderCredentialError if SARVAM key is missing and NEVER fall back to BOLNA", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce({
        ...baseTenant,
        voiceProvider: "SARVAM",
      });
      vi.mocked(mockSarvamRepo.findByTenantId).mockResolvedValueOnce(null);

      await expect(service.resolveActiveProvider("tenant-001")).rejects.toThrow(
        MissingVoiceProviderCredentialError,
      );
    });

    it("should throw InactiveVoiceProviderCredentialError if SARVAM key is inactive and NEVER fall back to BOLNA", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce({
        ...baseTenant,
        voiceProvider: "SARVAM",
      });
      vi.mocked(mockSarvamRepo.findByTenantId).mockResolvedValueOnce(
        mockInactiveSarvamKey as any,
      );

      await expect(service.resolveActiveProvider("tenant-001")).rejects.toThrow(
        InactiveVoiceProviderCredentialError,
      );
    });

    it("should throw TenantNotFoundError for non-existent tenant", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce(null);
      await expect(service.resolveActiveProvider("unknown")).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe("Provider Switching & Credential Preservation", () => {
    it("should successfully switch from BOLNA to SARVAM and preserve the bolnaApiKeyId association", async () => {
      const updated = await updateUseCase.execute("tenant-001", {
        voiceProvider: "SARVAM",
      });

      expect(mockTenantRepo.update).toHaveBeenCalledWith("tenant-001", {
        voiceProvider: "SARVAM",
      });
      expect(updated.voiceProvider).toBe("SARVAM");
      // Verify the tenant's bolnaApiKeyId association remains preserved
      expect(updated.bolnaApiKeyId).toBe("bolna-key-1");
    });

    it("should successfully switch from SARVAM to BOLNA and preserve the sarvamApiKey association", async () => {
      vi.mocked(mockTenantRepo.findById).mockResolvedValueOnce({
        ...baseTenant,
        voiceProvider: "SARVAM",
      });

      const updated = await updateUseCase.execute("tenant-001", {
        voiceProvider: "BOLNA",
        bolnaApiKeyId: "bolna-key-1",
      });

      expect(mockTenantRepo.update).toHaveBeenCalledWith("tenant-001", {
        voiceProvider: "BOLNA",
        bolnaApiKeyId: "bolna-key-1",
      });
      expect(updated.voiceProvider).toBe("BOLNA");
    });

    it("should reject switching to SARVAM if workspace has no configured Sarvam API key", async () => {
      vi.mocked(mockSarvamRepo.findByTenantId).mockResolvedValueOnce(null);

      await expect(
        updateUseCase.execute("tenant-001", { voiceProvider: "SARVAM" }),
      ).rejects.toThrow(MissingVoiceProviderCredentialError);

      expect(mockTenantRepo.update).not.toHaveBeenCalled();
    });

    it("should reject switching to SARVAM if workspace Sarvam API key is deactivated", async () => {
      vi.mocked(mockSarvamRepo.findByTenantId).mockResolvedValueOnce(
        mockInactiveSarvamKey as any,
      );

      await expect(
        updateUseCase.execute("tenant-001", { voiceProvider: "SARVAM" }),
      ).rejects.toThrow(InactiveVoiceProviderCredentialError);

      expect(mockTenantRepo.update).not.toHaveBeenCalled();
    });

    it("should reject switching to BOLNA if referenced Bolna key does not exist", async () => {
      await expect(
        updateUseCase.execute("tenant-001", {
          voiceProvider: "BOLNA",
          bolnaApiKeyId: "non-existent-uuid",
        }),
      ).rejects.toThrow(MissingVoiceProviderCredentialError);

      expect(mockTenantRepo.update).not.toHaveBeenCalled();
    });

    it("should reject switching to BOLNA if referenced Bolna key is inactive", async () => {
      await expect(
        updateUseCase.execute("tenant-001", {
          voiceProvider: "BOLNA",
          bolnaApiKeyId: "bolna-key-inactive",
        }),
      ).rejects.toThrow(InactiveVoiceProviderCredentialError);

      expect(mockTenantRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("Validation & Tenant Isolation Security", () => {
    it("should allow adminUpdateTenantSchema to accept voiceProvider and bolnaApiKeyId", () => {
      const validAdminPayload = {
        name: "Renamed Corp",
        voiceProvider: "SARVAM",
        bolnaApiKeyId: "a0000000-0000-0000-0000-000000000001",
      };
      const result = adminUpdateTenantSchema.safeParse(validAdminPayload);
      expect(result.success).toBe(true);
    });

    it("should forbid tenant updateWorkspaceSchema from accepting voiceProvider (mass-assignment protection)", () => {
      const maliciousTenantPayload = {
        name: "Renamed Corp",
        voiceProvider: "SARVAM",
        bolnaApiKeyId: "a0000000-0000-0000-0000-000000000001",
      };
      const parsed = updateWorkspaceSchema.parse(maliciousTenantPayload);
      expect(parsed).toEqual({ name: "Renamed Corp" });
      expect((parsed as any).voiceProvider).toBeUndefined();
      expect((parsed as any).bolnaApiKeyId).toBeUndefined();
    });

    it("should sanitize tenant-facing getCurrent response, completely stripping provider configuration and credentials", async () => {
      const mockGetTenant = {
        execute: vi.fn().mockResolvedValue({ ...baseTenant }),
      } as any;
      const mockUpdate = {} as any;
      const mockStats = {} as any;
      const mockOtp = {} as any;
      const mockVerify = {} as any;

      const controller = new TenantWorkspaceController(
        mockGetTenant,
        mockUpdate,
        mockStats,
        mockOtp,
        mockVerify,
      );

      const req: any = {
        user: { tenantId: "tenant-001", role: "ADMIN" },
      };
      let sentData: any = null;
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((payload) => {
          sentData = payload.data;
        }),
      };
      const next = vi.fn();

      await controller.getCurrent(req, res, next);

      expect(res.json).toHaveBeenCalled();
      expect(sentData).toBeDefined();
      expect(sentData.id).toBe("tenant-001");
      expect(sentData.name).toBe("Acme Voice Labs");
      // Internal fields must be completely stripped
      expect(sentData.voiceProvider).toBeUndefined();
      expect(sentData.bolnaApiKeyId).toBeUndefined();
      expect(sentData.bolnaApiKey).toBeUndefined();
      expect(sentData.sarvamApiKey).toBeUndefined();
    });
  });
});

