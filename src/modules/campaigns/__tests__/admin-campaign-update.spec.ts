// modules/campaigns/__tests__/admin-campaign-update.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateCampaignUseCase } from "../application/use-cases/update-campaign.use-case";
import { AdminCampaignController } from "../presentation/admin-campaign.controller";
import {
  CampaignNotFoundError,
  CampaignAlreadyDeletedError,
  MissingRequiredVariablesError,
} from "../domain/errors/campaign.errors";
import { PlatformAgentNotFoundError } from "../../platform-agents/domain/errors/platform-agent.errors";
import type { CampaignRepository } from "../application/interfaces/campaign-repository.interface";
import type { Request, Response } from "express";

describe("Admin Campaign Update UseCase & Controller", () => {
  let mockCampaignRepo: Partial<CampaignRepository>;
  let updateCampaignUseCase: UpdateCampaignUseCase;

  const sampleCampaign = {
    id: "campaign-123",
    tenantId: "tenant-abc",
    name: "Old Campaign Name",
    description: "Old description",
    status: "DRAFT" as const,
    assistantId: "assistant-1",
    variables: { company_name: "Acme Corp" },
    defaultRetryConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
    isDeleted: false,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCampaignRepo = {
      findById: vi.fn(),
      findByIdGlobal: vi.fn(),
      findAssistantWithAgent: vi.fn(),
      resolveAssistantForPlatformAgent: vi.fn(),
      update: vi.fn(),
    };

    updateCampaignUseCase = new UpdateCampaignUseCase(
      mockCampaignRepo as CampaignRepository,
    );
  });

  describe("UpdateCampaignUseCase across different statuses", () => {
    it("should update campaign details successfully when status is DRAFT", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        status: "DRAFT",
      });
      mockCampaignRepo.update = vi.fn().mockImplementation((_t, _c, data) =>
        Promise.resolve({
          ...sampleCampaign,
          status: "DRAFT",
          ...data,
        }),
      );

      const result = await updateCampaignUseCase.execute({
        tenantId: "tenant-abc",
        campaignId: "campaign-123",
        name: "New Name Draft",
        description: "New Description",
      });

      expect(result.name).toBe("New Name Draft");
      expect(result.description).toBe("New Description");
      expect(mockCampaignRepo.update).toHaveBeenCalledWith(
        "tenant-abc",
        "campaign-123",
        expect.objectContaining({
          name: "New Name Draft",
          description: "New Description",
        }),
      );
    });

    it("should update campaign details successfully when status is RUNNING", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        status: "RUNNING",
      });
      mockCampaignRepo.update = vi.fn().mockImplementation((_t, _c, data) =>
        Promise.resolve({
          ...sampleCampaign,
          status: "RUNNING",
          ...data,
        }),
      );

      const result = await updateCampaignUseCase.execute({
        tenantId: "tenant-abc",
        campaignId: "campaign-123",
        name: "Running Campaign Updated",
        defaultRetryConfig: {
          enabled: true,
          max_retries: 3,
        },
      });

      expect(result.name).toBe("Running Campaign Updated");
      expect(mockCampaignRepo.update).toHaveBeenCalledWith(
        "tenant-abc",
        "campaign-123",
        expect.objectContaining({
          name: "Running Campaign Updated",
          defaultRetryConfig: { enabled: true, max_retries: 3 },
        }),
      );
    });

    it("should update campaign details successfully when status is COMPLETED", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        status: "COMPLETED",
      });
      mockCampaignRepo.update = vi.fn().mockImplementation((_t, _c, data) =>
        Promise.resolve({
          ...sampleCampaign,
          status: "COMPLETED",
          ...data,
        }),
      );

      const result = await updateCampaignUseCase.execute({
        tenantId: "tenant-abc",
        campaignId: "campaign-123",
        description: "Updated notes after completion",
      });

      expect(result.description).toBe("Updated notes after completion");
      expect(mockCampaignRepo.update).toHaveBeenCalled();
    });

    it("should update campaign details successfully when status is FAILED", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        status: "FAILED",
      });
      mockCampaignRepo.update = vi.fn().mockImplementation((_t, _c, data) =>
        Promise.resolve({
          ...sampleCampaign,
          status: "FAILED",
          ...data,
        }),
      );

      const result = await updateCampaignUseCase.execute({
        tenantId: "tenant-abc",
        campaignId: "campaign-123",
        name: "Failed Campaign Renamed",
      });

      expect(result.name).toBe("Failed Campaign Renamed");
      expect(mockCampaignRepo.update).toHaveBeenCalled();
    });

    it("should throw CampaignNotFoundError when campaign does not exist", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(
        updateCampaignUseCase.execute({
          tenantId: "tenant-abc",
          campaignId: "non-existent",
          name: "Name",
        }),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("should throw CampaignAlreadyDeletedError when campaign is archived/deleted", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        isDeleted: true,
      });

      await expect(
        updateCampaignUseCase.execute({
          tenantId: "tenant-abc",
          campaignId: "campaign-123",
          name: "Should Fail",
        }),
      ).rejects.toThrow(CampaignAlreadyDeletedError);
    });

    it("should validate and clean required variables when variables are updated", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        status: "RUNNING",
        variables: { company_name: "Acme Corp" },
      });
      mockCampaignRepo.findAssistantWithAgent = vi.fn().mockResolvedValue({
        id: "assistant-1",
        name: "Test Agent",
        platformAgent: {
          id: "pa-1",
          bolnaId: "bolna-agent-1",
          requiredVariables: [
            { name: "company_name", label: "Company", required: true, isEditable: true },
            { name: "rep_name", label: "Rep Name", required: true, isEditable: true },
          ],
        },
      });

      // Missing rep_name and isAgentChanged: true
      await expect(
        updateCampaignUseCase.execute({
          tenantId: "tenant-abc",
          campaignId: "campaign-123",
          assistantId: "assistant-2",
          variables: { company_name: "Acme Corp" },
        }),
      ).rejects.toThrow(MissingRequiredVariablesError);
    });

    it("should resolve assistant when platformAgentId is provided", async () => {
      mockCampaignRepo.findById = vi.fn().mockResolvedValue({
        ...sampleCampaign,
        status: "RUNNING",
      });
      mockCampaignRepo.resolveAssistantForPlatformAgent = vi
        .fn()
        .mockResolvedValue(null);

      await expect(
        updateCampaignUseCase.execute({
          tenantId: "tenant-abc",
          campaignId: "campaign-123",
          platformAgentId: "pa-missing",
        }),
      ).rejects.toThrow(PlatformAgentNotFoundError);
    });
  });

  describe("AdminCampaignController.update presentation handling", () => {
    it("should return HTTP 200 with 'Campaign updated successfully' message", async () => {
      const mockUseCase = {
        execute: vi.fn().mockResolvedValue({
          ...sampleCampaign,
          status: "RUNNING",
          name: "Updated via Controller",
        }),
      };

      const controller = new AdminCampaignController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockUseCase as any,
      );

      const req = {
        params: { id: "campaign-123" },
        query: { tenantId: "tenant-abc" },
        body: {
          name: "Updated via Controller",
        },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn();

      await controller.update(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Campaign updated successfully",
          data: expect.objectContaining({
            name: "Updated via Controller",
          }),
        }),
      );

      // Verify updateDraft alias delegates to update
      expect(controller.updateDraft).toBe(controller.update);
    });
  });
});
