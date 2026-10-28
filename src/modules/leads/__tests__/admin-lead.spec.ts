// modules/leads/__tests__/admin-lead.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminLeadController } from "../presentation/admin-lead.controller";
import { ToggleLeadDncUseCase } from "../application/use-cases/toggle-lead-dnc.use-case";
import { RevealLeadPiiUseCase } from "../application/use-cases/reveal-lead-pii.use-case";
import { LeadNotFoundError } from "../domain/errors/lead.errors";
import prisma from "../../../shared/config/database/prisma";
import type { Request, Response } from "express";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    lead: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("Admin Lead Module & DNC / PII Masking Controls", () => {
  const mockLeadRepo = {
    list: vi.fn(),
    findById: vi.fn(),
    getStats: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    updateDnc: vi.fn(),
    findByTenantAndPhone: vi.fn(),
    createInboundLead: vi.fn(),
    updateStatus: vi.fn(),
    createQuickDialLead: vi.fn(),
  };

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  const mockListLeads = { execute: vi.fn() };
  const mockGetLead = { execute: vi.fn() };
  const mockGetStats = { execute: vi.fn() };
  const mockArchiveLead = { execute: vi.fn() };
  const mockRestoreLead = { execute: vi.fn() };

  let toggleDncUseCase: ToggleLeadDncUseCase;
  let revealPiiUseCase: RevealLeadPiiUseCase;
  let controller: AdminLeadController;

  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    toggleDncUseCase = new ToggleLeadDncUseCase(mockLeadRepo as any);
    revealPiiUseCase = new RevealLeadPiiUseCase(
      mockLeadRepo as any,
      mockLogger as any,
    );

    controller = new AdminLeadController(
      mockListLeads as any,
      mockGetLead as any,
      mockGetStats as any,
      mockArchiveLead as any,
      mockRestoreLead as any,
      toggleDncUseCase,
      revealPiiUseCase,
    );
  });

  describe("ToggleLeadDncUseCase", () => {
    it("should reject reason with fewer than 3 characters", async () => {
      await expect(
        toggleDncUseCase.execute({
          tenantId: "t-1",
          leadId: "l-1",
          doNotCall: true,
          reason: "no",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("DNC reason must be at least 3 characters");
    });

    it("should throw LeadNotFoundError if lead does not exist", async () => {
      mockLeadRepo.findById.mockResolvedValueOnce(null);

      await expect(
        toggleDncUseCase.execute({
          tenantId: "t-1",
          leadId: "l-missing",
          doNotCall: true,
          reason: "Customer requested removal",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow(LeadNotFoundError);
    });

    it("should update DNC status and return updated lead", async () => {
      mockLeadRepo.findById.mockResolvedValueOnce({
        id: "l-1",
        tenantId: "t-1",
        doNotCall: false,
      });

      mockLeadRepo.updateDnc.mockResolvedValueOnce({
        id: "l-1",
        tenantId: "t-1",
        doNotCall: true,
        metadata: { dncReason: "Customer requested removal" },
      });

      const result = await toggleDncUseCase.execute({
        tenantId: "t-1",
        leadId: "l-1",
        doNotCall: true,
        reason: "Customer requested removal",
        adminUserId: "admin-1",
      });

      expect(mockLeadRepo.updateDnc).toHaveBeenCalledWith("t-1", "l-1", {
        doNotCall: true,
        reason: "Customer requested removal",
        adminUserId: "admin-1",
      });
      expect(result.doNotCall).toBe(true);
    });
  });

  describe("RevealLeadPiiUseCase", () => {
    it("should throw LeadNotFoundError if lead does not exist", async () => {
      mockLeadRepo.findById.mockResolvedValueOnce(null);

      await expect(
        revealPiiUseCase.execute({
          tenantId: "t-1",
          leadId: "l-missing",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow(LeadNotFoundError);
    });

    it("should log audit trail and return unmasked PII", async () => {
      mockLeadRepo.findById.mockResolvedValueOnce({
        id: "l-1",
        tenantId: "t-1",
        name: "Ibrahim Thekkumkara",
        phone: "+919876543210",
        email: "ibrahim@example.com",
      });

      const result = await revealPiiUseCase.execute({
        tenantId: "t-1",
        leadId: "l-1",
        adminUserId: "admin-user-42",
        adminEmail: "admin@kooi.ai",
        reason: "Compliance dispute investigation",
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[Audit] Platform Administrator accessed Lead PII",
        expect.objectContaining({
          action: "LEAD_PII_REVEAL",
          tenantId: "t-1",
          leadId: "l-1",
          adminUserId: "admin-user-42",
          adminEmail: "admin@kooi.ai",
          reason: "Compliance dispute investigation",
        }),
      );

      expect(result).toMatchObject({
        id: "l-1",
        name: "Ibrahim Thekkumkara",
        phone: "+919876543210",
        email: "ibrahim@example.com",
      });
      expect(result.revealedAt).toBeDefined();
    });
  });

  describe("AdminLeadController", () => {
    it("toggleDnc handles toggle request successfully", async () => {
      mockLeadRepo.findById.mockResolvedValueOnce({
        id: "l-1",
        tenantId: "t-1",
        doNotCall: false,
      });

      mockLeadRepo.updateDnc.mockResolvedValueOnce({
        id: "l-1",
        doNotCall: true,
      });

      const req = {
        params: { id: "l-1" },
        query: { tenantId: "t-1" },
        body: {
          doNotCall: true,
          reason: "Explicit customer opt-out",
        },
        user: { userId: "admin-1", email: "admin@kooi.ai" },
      } as unknown as Request;

      await controller.toggleDnc(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Lead added to Do Not Call registry",
          data: { id: "l-1", doNotCall: true },
        }),
      );
    });

    it("revealPii handles reveal request and logs access", async () => {
      mockLeadRepo.findById.mockResolvedValueOnce({
        id: "l-1",
        tenantId: "t-1",
        name: "John Doe",
        phone: "+919876543210",
        email: "john@example.com",
      });

      const req = {
        params: { id: "l-1" },
        query: { tenantId: "t-1" },
        body: {
          reason: "Customer support inquiry",
        },
        user: { id: "admin-1", email: "admin@kooi.ai" },
      } as unknown as Request;

      await controller.revealPii(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Lead PII revealed",
          data: expect.objectContaining({
            phone: "+919876543210",
          }),
        }),
      );
    });

    it("falls back to database lookup if tenantId is omitted from query", async () => {
      (prisma.lead.findUnique as any).mockResolvedValueOnce({
        tenantId: "t-fallback",
      });

      mockLeadRepo.findById.mockResolvedValueOnce({
        id: "l-1",
        tenantId: "t-fallback",
        name: "Jane Doe",
        phone: "+919876543210",
        email: null,
      });

      const req = {
        params: { id: "l-1" },
        query: {},
        body: {},
        user: { userId: "admin-1", email: "admin@kooi.ai" },
      } as unknown as Request;

      await controller.revealPii(req, mockRes, mockNext);

      expect(prisma.lead.findUnique).toHaveBeenCalledWith({
        where: { id: "l-1" },
        select: { tenantId: true },
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("forwards errors to next(err)", async () => {
      const err = new Error("Database offline");
      mockLeadRepo.findById.mockRejectedValueOnce(err);

      const req = {
        params: { id: "l-1" },
        query: { tenantId: "t-1" },
        body: { doNotCall: true, reason: "Valid reason" },
        user: { userId: "admin-1", email: "admin@kooi.ai" },
      } as unknown as Request;

      await controller.toggleDnc(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(err);
    });
  });
});
