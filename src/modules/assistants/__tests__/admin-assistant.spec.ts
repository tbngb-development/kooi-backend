// modules/assistants/__tests__/admin-assistant.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteAssistantUseCase } from "../application/use-cases/delete-assistant.use-case";
import { ListAssistantsUseCase } from "../application/use-cases/list-assistants.use-case";
import { AdminAssistantController } from "../presentation/admin-assistant.controller";
import {
  AssistantNotFoundError,
  AssistantInUseError,
} from "../domain/errors/assistant.errors";
import type { Request, Response } from "express";

describe("Admin Assistant Module & Active Campaign Safeguards", () => {
  const mockAssistantRepo = {
    list: vi.fn(),
    countActiveCampaigns: vi.fn(),
    findById: vi.fn(),
    findByIdWithPlatformAgent: vi.fn(),
    findByPlatformAgentId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateConfig: vi.fn(),
    findByTenantId: vi.fn(),
    repointPlatformAgent: vi.fn(),
    findInboundByBolnaAgentId: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };

  const mockListBolnaAgents = { execute: vi.fn() };
  const mockGetAssistant = { execute: vi.fn() };
  const mockRegisterAssistant = { execute: vi.fn() };
  const mockUpdateAssistant = { execute: vi.fn() };
  const mockRestoreAssistant = { execute: vi.fn() };

  let deleteAssistantUseCase: DeleteAssistantUseCase;
  let listAssistantsUseCase: ListAssistantsUseCase;
  let controller: AdminAssistantController;

  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    deleteAssistantUseCase = new DeleteAssistantUseCase(mockAssistantRepo as any);
    listAssistantsUseCase = new ListAssistantsUseCase(mockAssistantRepo as any);

    controller = new AdminAssistantController(
      listAssistantsUseCase,
      mockListBolnaAgents as any,
      mockGetAssistant as any,
      mockRegisterAssistant as any,
      mockUpdateAssistant as any,
      deleteAssistantUseCase,
      mockRestoreAssistant as any,
    );
  });

  describe("DeleteAssistantUseCase (GAP-AST-03: Active Campaign Dependency Guard)", () => {
    it("should throw AssistantNotFoundError when assistant does not exist", async () => {
      mockAssistantRepo.findById.mockResolvedValue(null);

      await expect(
        deleteAssistantUseCase.execute("tenant-1", "ast-404"),
      ).rejects.toThrow(AssistantNotFoundError);

      expect(mockAssistantRepo.countActiveCampaigns).not.toHaveBeenCalled();
      expect(mockAssistantRepo.softDelete).not.toHaveBeenCalled();
    });

    it("should block deletion and throw AssistantInUseError when assistant is assigned to running campaigns", async () => {
      mockAssistantRepo.findById.mockResolvedValue({
        id: "ast-1",
        tenantId: "tenant-1",
        name: "Sales Rep",
      });
      mockAssistantRepo.countActiveCampaigns.mockResolvedValue(2);

      await expect(
        deleteAssistantUseCase.execute("tenant-1", "ast-1"),
      ).rejects.toThrow(AssistantInUseError);

      await expect(
        deleteAssistantUseCase.execute("tenant-1", "ast-1"),
      ).rejects.toThrow(/referenced by 2 campaign\(s\)/);

      expect(mockAssistantRepo.softDelete).not.toHaveBeenCalled();
    });

    it("should successfully soft-delete assistant when no active campaigns reference it", async () => {
      mockAssistantRepo.findById.mockResolvedValue({
        id: "ast-1",
        tenantId: "tenant-1",
        name: "Sales Rep",
      });
      mockAssistantRepo.countActiveCampaigns.mockResolvedValue(0);
      mockAssistantRepo.softDelete.mockResolvedValue(undefined);

      await deleteAssistantUseCase.execute("tenant-1", "ast-1");

      expect(mockAssistantRepo.countActiveCampaigns).toHaveBeenCalledWith(
        "tenant-1",
        "ast-1",
      );
      expect(mockAssistantRepo.softDelete).toHaveBeenCalledWith(
        "tenant-1",
        "ast-1",
      );
    });
  });

  describe("ListAssistantsUseCase (GAP-AST-01 & GAP-AST-02)", () => {
    it("should pass includeArchived option to repository", async () => {
      const mockResult = [
        {
          id: "ast-1",
          name: "Front Desk",
          phoneNumbers: [
            {
              id: "pn-1",
              phoneNumber: "+15551234567",
              friendlyName: "Inbound Hotline",
              provider: "BOLNA",
              status: "ACTIVE",
              capabilities: "BOTH",
            },
          ],
          metrics: {
            totalCalls: 45,
            completedCalls: 40,
            billableSeconds: 5400,
            avgDurationSeconds: 120,
            activeCampaignCount: 1,
            totalCampaignCount: 3,
          },
          syncStatus: "SYNCED" as const,
        },
      ];
      mockAssistantRepo.list.mockResolvedValue(mockResult);

      const result = await listAssistantsUseCase.execute("tenant-1", true);

      expect(mockAssistantRepo.list).toHaveBeenCalledWith("tenant-1", true);
      expect(result).toEqual(mockResult);
      expect(result[0].phoneNumbers).toHaveLength(1);
      expect(result[0].metrics?.totalCalls).toBe(45);
      expect(result[0].syncStatus).toBe("SYNCED");
    });
  });

  describe("AdminAssistantController", () => {
    it("should default includeArchived to true for administrative listings", async () => {
      mockAssistantRepo.list.mockResolvedValue([]);
      const req = {
        query: { tenantId: "tenant-1" },
        body: {},
      } as unknown as Request;

      await controller.list(req, mockRes, mockNext);

      expect(mockAssistantRepo.list).toHaveBeenCalledWith("tenant-1", true);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [],
        }),
      );
    });

    it("should respect includeArchived=false query parameter", async () => {
      mockAssistantRepo.list.mockResolvedValue([]);
      const req = {
        query: { tenantId: "tenant-1", includeArchived: "false" },
        body: {},
      } as unknown as Request;

      await controller.list(req, mockRes, mockNext);

      expect(mockAssistantRepo.list).toHaveBeenCalledWith("tenant-1", false);
    });

    it("should return conflict error via next() when deleting an assistant in use", async () => {
      mockAssistantRepo.findById.mockResolvedValue({ id: "ast-1" });
      mockAssistantRepo.countActiveCampaigns.mockResolvedValue(3);

      const req = {
        params: { id: "ast-1" },
        query: { tenantId: "tenant-1" },
        body: {},
      } as unknown as Request;

      await controller.remove(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AssistantInUseError));
    });

    it("should successfully remove an unused assistant", async () => {
      mockAssistantRepo.findById.mockResolvedValue({ id: "ast-1" });
      mockAssistantRepo.countActiveCampaigns.mockResolvedValue(0);
      mockAssistantRepo.softDelete.mockResolvedValue(undefined);

      const req = {
        params: { id: "ast-1" },
        query: { tenantId: "tenant-1" },
        body: {},
      } as unknown as Request;

      await controller.remove(req, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { message: "Assistant removed successfully" },
        }),
      );
    });

    it("should restore an archived assistant", async () => {
      mockRestoreAssistant.execute.mockResolvedValue(undefined);

      const req = {
        params: { id: "ast-1" },
        query: { tenantId: "tenant-1" },
        body: {},
      } as unknown as Request;

      await controller.restore(req, mockRes, mockNext);

      expect(mockRestoreAssistant.execute).toHaveBeenCalledWith(
        "tenant-1",
        "ast-1",
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { id: "ast-1" },
        }),
      );
    });
  });
});
