// modules/campaigns/__tests__/campaign-provider-snapshot.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateCampaignUseCase } from "../application/use-cases/create-campaign.use-case";
import { UpdateCampaignUseCase } from "../application/use-cases/update-campaign.use-case";
import { updateCampaignSchema } from "../presentation/campaign.schema";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { ITenantVoiceProviderService } from "../../tenants/application/services/tenant-voice-provider.service";
import {
  MissingVoiceProviderCredentialError,
  InactiveVoiceProviderCredentialError,
} from "../../tenants/domain/tenant.errors";

describe("Campaign Voice Provider Snapshotting & Immutability", () => {
  let mockCampaignRepo: Partial<CampaignRepository>;
  let mockPlanRepo: Partial<PlanRepository>;
  let mockVoiceProviderService: Partial<ITenantVoiceProviderService>;
  let createCampaignUseCase: CreateCampaignUseCase;
  let updateCampaignUseCase: UpdateCampaignUseCase;

  const tenantId = "tenant-test-1";

  const sampleAssistant = {
    id: "assistant-1",
    name: "Sales Agent",
    platformAgent: {
      id: "agent-1",
      bolnaId: "bolna-agent-1",
      requiredVariables: null,
    },
  };

  const sampleCreatedCampaign = {
    id: "campaign-100",
    tenantId,
    name: "Q4 Outbound Campaign",
    description: "Lead Qualification",
    status: "DRAFT" as const,
    assistantId: "assistant-1",
    provider: "BOLNA" as const,
    sarvamCampaignId: null,
    variables: null,
    defaultRetryConfig: null,
    totalLeads: 0,
    calledLeads: 0,
    completedLeads: 0,
    failedLeads: 0,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCampaignRepo = {
      create: vi.fn().mockImplementation((_t, data) =>
        Promise.resolve({
          ...sampleCreatedCampaign,
          provider: data.provider ?? "BOLNA",
        }),
      ),
      findAssistantWithAgent: vi.fn().mockResolvedValue(sampleAssistant),
      findById: vi.fn().mockResolvedValue(sampleCreatedCampaign),
      update: vi.fn().mockImplementation((_t, _c, data) =>
        Promise.resolve({
          ...sampleCreatedCampaign,
          ...data,
        }),
      ),
    };

    mockPlanRepo = {
      getActivePlanForTenant: vi.fn().mockResolvedValue({
        id: "plan-1",
        maxActiveCampaigns: 10,
        retryAutomation: true,
      }),
      countActiveCampaigns: vi.fn().mockResolvedValue(0),
    };

    mockVoiceProviderService = {
      resolveActiveProvider: vi.fn().mockResolvedValue({
        provider: "BOLNA",
        credential: { id: "bolna-key-1", isActive: true, provider: "BOLNA" },
      }),
    };

    createCampaignUseCase = new CreateCampaignUseCase(
      mockCampaignRepo as CampaignRepository,
      mockPlanRepo as PlanRepository,
      mockVoiceProviderService as ITenantVoiceProviderService,
    );

    updateCampaignUseCase = new UpdateCampaignUseCase(
      mockCampaignRepo as CampaignRepository,
    );
  });

  describe("Provider Snapshotting on Campaign Creation", () => {
    it("should snapshot BOLNA when tenant's active voice provider is BOLNA", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockResolvedValue({
        provider: "BOLNA",
        credential: { id: "bolna-key-1", isActive: true, provider: "BOLNA" },
      });

      const campaign = await createCampaignUseCase.execute(tenantId, {
        name: "Bolna Campaign",
        assistantId: "assistant-1",
      });

      expect(mockVoiceProviderService.resolveActiveProvider).toHaveBeenCalledWith(tenantId);
      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ provider: "BOLNA" }),
      );
      expect(campaign.provider).toBe("BOLNA");
    });

    it("should snapshot SARVAM when tenant's active voice provider is SARVAM", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockResolvedValue({
        provider: "SARVAM",
        credential: { id: "sarvam-key-1", isActive: true, provider: "SARVAM" },
      });

      const campaign = await createCampaignUseCase.execute(tenantId, {
        name: "Sarvam Campaign",
        assistantId: "assistant-1",
      });

      expect(mockVoiceProviderService.resolveActiveProvider).toHaveBeenCalledWith(tenantId);
      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ provider: "SARVAM" }),
      );
      expect(campaign.provider).toBe("SARVAM");
    });

    it("should fail-fast if tenant lacks an active BOLNA credential", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockRejectedValue(
        new MissingVoiceProviderCredentialError("BOLNA"),
      );

      await expect(
        createCampaignUseCase.execute(tenantId, {
          name: "Invalid Bolna Campaign",
          assistantId: "assistant-1",
        }),
      ).rejects.toThrow(MissingVoiceProviderCredentialError);

      expect(mockCampaignRepo.create).not.toHaveBeenCalled();
    });

    it("should fail-fast if tenant lacks an active SARVAM credential", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockRejectedValue(
        new MissingVoiceProviderCredentialError("SARVAM"),
      );

      await expect(
        createCampaignUseCase.execute(tenantId, {
          name: "Invalid Sarvam Campaign",
          assistantId: "assistant-1",
        }),
      ).rejects.toThrow(MissingVoiceProviderCredentialError);

      expect(mockCampaignRepo.create).not.toHaveBeenCalled();
    });

    it("should fail-fast if tenant provider credential is inactive", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockRejectedValue(
        new InactiveVoiceProviderCredentialError("BOLNA"),
      );

      await expect(
        createCampaignUseCase.execute(tenantId, {
          name: "Inactive Credential Campaign",
          assistantId: "assistant-1",
        }),
      ).rejects.toThrow(InactiveVoiceProviderCredentialError);

      expect(mockCampaignRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("Provider Immutability & Protection Against Modification", () => {
    it("should strip provider if client attempts to pass provider in update schema", () => {
      const payload = {
        name: "Updated Campaign Name",
        provider: "SARVAM",
      };

      const parsed = updateCampaignSchema.parse(payload);
      expect((parsed as any).provider).toBeUndefined();
      expect(parsed.name).toBe("Updated Campaign Name");
    });

    it("should not allow ordinary update APIs to modify provider", async () => {
      const existingCampaign = {
        ...sampleCreatedCampaign,
        provider: "BOLNA" as const,
      };
      mockCampaignRepo.findById = vi.fn().mockResolvedValue(existingCampaign);

      await updateCampaignUseCase.execute({
        tenantId,
        campaignId: "campaign-100",
        name: "New Name Only",
      });

      expect(mockCampaignRepo.update).toHaveBeenCalledWith(
        tenantId,
        "campaign-100",
        expect.not.objectContaining({ provider: expect.anything() }),
      );
    });
  });
});

