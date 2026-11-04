// modules/campaigns/__tests__/sarvam-campaign-creation.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateCampaignUseCase } from "../application/use-cases/create-campaign.use-case";
import { createCampaignSchema } from "../presentation/campaign.schema";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { PlanRepository } from "../../plans/application/interfaces/plan-repository.interface";
import type { ITenantVoiceProviderService } from "../../tenants/application/services/tenant-voice-provider.service";
import type { ISarvamCampaignClient } from "../infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import {
  CampaignAssistantRequiredError,
  CampaignAssistantNotFoundError,
  CampaignSarvamAgentRequiredError,
  CampaignSarvamAgentNotFoundError,
  CampaignScheduleRequiredError,
  ExternalCampaignCreationFailedError,
} from "../domain/errors/campaign.errors";

describe("Sarvam Campaign Creation Suite (Phase 1)", () => {
  const tenantId = "tenant-sarvam-001";
  const validAgentId = "b97d1956-fdf9-4c80-be34-e4210e7ee61b";
  const validAssistantId = "a11d1956-fdf9-4c80-be34-e4210e7ee61a";

  const validSchedule = {
    allowed_start_time: "09:30",
    allowed_end_time: "18:30",
    allowed_days: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ] as any,
    timezone: "Asia/Kolkata",
  };

  const sampleSarvamAgent = {
    id: validAgentId,
    name: "Customer Support Agent",
    appId: "sarvam-app-999",
    appVersion: 1,
    attemptsPerSecond: 2,
    webhookUrl: null,
    agentVariables: [
      {
        key: "customer_name",
        defaultValue: "",
        isTenantVisible: true,
        isTenantEditable: true,
      },
    ],
    connectionConfigs: [
      { connection_id: "conn-1", agent_phone_number: "+918000000000" },
    ],
    retryConfig: { max_retries: 2 },
    allowTenantVisible: true,
    status: "ACTIVE",
    apiKey: {
      id: "key-1",
      tenantId,
      apiKeyEncrypted: "enc:iv:tag:ciphertext",
      workspaceId: "workspace-123",
      organizationId: "org-456",
      isActive: true,
    },
  };

  describe("Schema Validation (createCampaignSchema)", () => {
    it("should accept valid Sarvam campaign payload", () => {
      const payload = {
        name: "Sarvam Support Campaign",
        sarvamAgentId: validAgentId,
        startTimestamp: "2026-05-01T09:00:00.000Z",
        endTimestamp: "2026-05-15T18:00:00.000Z",
        allowedSchedule: validSchedule,
      };

      const result = createCampaignSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should accept valid Bolna campaign payload", () => {
      const payload = {
        name: "Bolna Sales Campaign",
        assistantId: validAssistantId,
      };

      const result = createCampaignSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should reject payload missing both assistantId and sarvamAgentId", () => {
      const payload = {
        name: "Missing Agent Campaign",
      };

      const result = createCampaignSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(
        result.error?.issues.some((i) =>
          i.message.includes("Either assistantId or sarvamAgentId is required"),
        ),
      ).toBe(true);
    });

    it("should reject Sarvam payload missing startTimestamp, endTimestamp, or allowedSchedule", () => {
      const payload = {
        name: "Incomplete Sarvam Campaign",
        sarvamAgentId: validAgentId,
      };

      const result = createCampaignSchema.safeParse(payload);
      expect(result.success).toBe(false);
      const messages = result.error?.issues.map((i) => i.message) ?? [];
      expect(messages).toContain("startTimestamp is required for Sarvam campaigns");
      expect(messages).toContain("endTimestamp is required for Sarvam campaigns");
      expect(messages).toContain("allowedSchedule is required for Sarvam campaigns");
    });

    it("should reject Sarvam payload where endTimestamp is before startTimestamp", () => {
      const payload = {
        name: "Inverted Schedule Campaign",
        sarvamAgentId: validAgentId,
        startTimestamp: "2026-05-15T18:00:00.000Z",
        endTimestamp: "2026-05-01T09:00:00.000Z",
        allowedSchedule: validSchedule,
      };

      const result = createCampaignSchema.safeParse(payload);
      expect(result.success).toBe(false);
      expect(
        result.error?.issues.some((i) =>
          i.message.includes("endTimestamp must be after startTimestamp"),
        ),
      ).toBe(true);
    });

    it("should reject invalid time format in allowedSchedule", () => {
      const payload = {
        name: "Bad Schedule Campaign",
        sarvamAgentId: validAgentId,
        startTimestamp: "2026-05-01T09:00:00.000Z",
        endTimestamp: "2026-05-15T18:00:00.000Z",
        allowedSchedule: {
          ...validSchedule,
          allowed_start_time: "25:00", // invalid hour
        },
      };

      const result = createCampaignSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("CreateCampaignUseCase Execution", () => {
    let mockCampaignRepo: Partial<CampaignRepository>;
    let mockPlanRepo: Partial<PlanRepository>;
    let mockVoiceProviderService: Partial<ITenantVoiceProviderService>;
    let mockSarvamClient: Partial<ISarvamCampaignClient>;
    let mockEncryptionService: Partial<ISarvamApiKeyEncryptionService>;
    let useCase: CreateCampaignUseCase;
    let storedCampaign: any;

    beforeEach(() => {
      storedCampaign = {
        id: "kooi-camp-100",
        tenantId,
        name: "Sarvam Support Campaign",
        status: "SCHEDULED",
        provider: "SARVAM",
        sarvamAgentId: validAgentId,
        sarvamCampaignId: null,
      };

      mockCampaignRepo = {
        create: vi.fn().mockImplementation((_t, data) => {
          storedCampaign = {
            ...storedCampaign,
            ...data,
          };
          return Promise.resolve(storedCampaign);
        }),
        update: vi.fn().mockImplementation((_t, _id, data) => {
          storedCampaign = {
            ...storedCampaign,
            ...data,
          };
          return Promise.resolve(storedCampaign);
        }),
        updateStatus: vi.fn().mockImplementation((_id, status) => {
          storedCampaign.status = status;
          return Promise.resolve(storedCampaign);
        }),
        findSarvamAgentWithApiKey: vi.fn().mockResolvedValue(sampleSarvamAgent),
        findAssistantWithAgent: vi.fn().mockResolvedValue({
          id: validAssistantId,
          name: "Bolna Sales Assistant",
          platformAgent: {
            id: "agent-1",
            bolnaId: "bolna-agent-1",
            requiredVariables: null,
          },
        }),
      };

      mockPlanRepo = {
        getActivePlanForTenant: vi.fn().mockResolvedValue({
          id: "plan-1",
          maxActiveCampaigns: 5,
          retryAutomation: true,
        }),
        countActiveCampaigns: vi.fn().mockResolvedValue(0),
      };

      mockVoiceProviderService = {
        resolveActiveProvider: vi.fn().mockResolvedValue({
          provider: "SARVAM",
          credential: { id: "sarvam-key-1", isActive: true, provider: "SARVAM" },
        }),
      };

      mockSarvamClient = {
        createCampaign: vi.fn().mockResolvedValue({
          campaign_id: "ext-sarvam-camp-999",
          name: "Sarvam Support Campaign",
          status: "scheduled",
          app_id: "sarvam-app-999",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      };

      mockEncryptionService = {
        encrypt: vi.fn().mockReturnValue("encrypted"),
        decrypt: vi.fn().mockReturnValue("decrypted-api-key-test"),
      };

      useCase = new CreateCampaignUseCase(
        mockCampaignRepo as CampaignRepository,
        mockPlanRepo as PlanRepository,
        mockVoiceProviderService as ITenantVoiceProviderService,
        mockSarvamClient as ISarvamCampaignClient,
        mockEncryptionService as ISarvamApiKeyEncryptionService,
      );
    });

    it("should successfully create Sarvam campaign internally and externally", async () => {
      const result = await useCase.execute(tenantId, {
        name: "Sarvam Support Campaign",
        sarvamAgentId: validAgentId,
        startTimestamp: "2026-05-01T09:00:00.000Z",
        endTimestamp: "2026-05-15T18:00:00.000Z",
        allowedSchedule: validSchedule,
      });

      // 1. Verify internal creation occurred with SCHEDULED status
      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          provider: "SARVAM",
          status: "SCHEDULED",
          sarvamAgentId: validAgentId,
        }),
      );

      // 2. Verify decryption occurred
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(
        sampleSarvamAgent.apiKey.apiKeyEncrypted,
      );

      // 3. Verify external Sarvam API call
      expect(mockSarvamClient.createCampaign).toHaveBeenCalledWith(
        "org-456",
        "workspace-123",
        "decrypted-api-key-test",
        expect.objectContaining({
          name: "Sarvam Support Campaign",
          start_timestamp: "2026-05-01T09:00:00.000Z",
          end_timestamp: "2026-05-15T18:00:00.000Z",
          app_config: expect.objectContaining({
            app_id: "sarvam-app-999",
            app_version: 1,
            attempts_per_second: 2,
          }),
        }),
      );

      // 4. Verify external campaign ID saved
      expect(mockCampaignRepo.update).toHaveBeenCalledWith(
        tenantId,
        "kooi-camp-100",
        {
          sarvamCampaignId: "ext-sarvam-camp-999",
        },
      );

      expect(result.sarvamCampaignId).toBe("ext-sarvam-camp-999");
      expect(result.provider).toBe("SARVAM");
    });

    it("should mark internal campaign as FAILED and throw when external API fails", async () => {
      mockSarvamClient.createCampaign = vi
        .fn()
        .mockRejectedValue(new Error("Sarvam 422: Invalid connection_id"));

      await expect(
        useCase.execute(tenantId, {
          name: "Failing Campaign",
          sarvamAgentId: validAgentId,
          startTimestamp: "2026-05-01T09:00:00.000Z",
          endTimestamp: "2026-05-15T18:00:00.000Z",
          allowedSchedule: validSchedule,
        }),
      ).rejects.toThrow(ExternalCampaignCreationFailedError);

      // Verify status was flipped to FAILED
      expect(mockCampaignRepo.updateStatus).toHaveBeenCalledWith(
        "kooi-camp-100",
        "FAILED",
      );
      expect(storedCampaign.status).toBe("FAILED");
    });

    it("should reject if sarvamAgentId is missing for SARVAM provider", async () => {
      await expect(
        useCase.execute(tenantId, {
          name: "Missing Sarvam Agent",
          startTimestamp: "2026-05-01T09:00:00.000Z",
          endTimestamp: "2026-05-15T18:00:00.000Z",
          allowedSchedule: validSchedule,
        } as any),
      ).rejects.toThrow(CampaignSarvamAgentRequiredError);
    });

    it("should reject if schedule is missing for SARVAM provider", async () => {
      await expect(
        useCase.execute(tenantId, {
          name: "Missing Schedule",
          sarvamAgentId: validAgentId,
        } as any),
      ).rejects.toThrow(CampaignScheduleRequiredError);
    });

    it("should reject if Sarvam agent is not found or not accessible", async () => {
      mockCampaignRepo.findSarvamAgentWithApiKey = vi
        .fn()
        .mockResolvedValue(null);

      await expect(
        useCase.execute(tenantId, {
          name: "Unassigned Agent Campaign",
          sarvamAgentId: validAgentId,
          startTimestamp: "2026-05-01T09:00:00.000Z",
          endTimestamp: "2026-05-15T18:00:00.000Z",
          allowedSchedule: validSchedule,
        }),
      ).rejects.toThrow(CampaignSarvamAgentNotFoundError);
    });

    it("should handle BOLNA provider normally without calling Sarvam client", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockResolvedValue({
        provider: "BOLNA",
        credential: { id: "bolna-key-1", isActive: true, provider: "BOLNA" },
      });

      const bolnaCampaign = await useCase.execute(tenantId, {
        name: "Normal Bolna Campaign",
        assistantId: validAssistantId,
      });

      expect(mockSarvamClient.createCampaign).not.toHaveBeenCalled();
      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          provider: "BOLNA",
          assistantId: validAssistantId,
        }),
      );
      expect(bolnaCampaign.provider).toBe("BOLNA");
    });

    it("should reject BOLNA provider if assistantId is missing", async () => {
      mockVoiceProviderService.resolveActiveProvider = vi.fn().mockResolvedValue({
        provider: "BOLNA",
        credential: { id: "bolna-key-1", isActive: true, provider: "BOLNA" },
      });

      await expect(
        useCase.execute(tenantId, {
          name: "Missing Assistant Bolna Campaign",
        } as any),
      ).rejects.toThrow(CampaignAssistantRequiredError);
    });
  });
});

