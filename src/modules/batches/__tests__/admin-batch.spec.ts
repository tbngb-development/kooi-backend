// modules/batches/__tests__/admin-batch.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminBatchController } from "../presentation/admin-batch.controller";
import { RetryFailedBatchUseCase } from "../application/use-cases/retry-failed-batch.use-case";
import { CampaignNotFoundError } from "../../campaigns/domain/errors/campaign.errors";
import { BatchNotFoundError } from "../domain/errors/batch.errors";
import prisma from "../../../shared/config/database/prisma";
import type { Request, Response } from "express";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    leadBatch: {
      findUnique: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("Admin Batch Module & Operational Controls", () => {
  const mockBatchRepo = {
    list: vi.fn(),
    findById: vi.fn(),
    findByIdWithDetail: vi.fn(),
    getStats: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };

  const mockCampaignRepo = {
    findById: vi.fn(),
  };

  const mockStopBatchUseCase = {
    execute: vi.fn(),
  };

  const mockResumeBatchUseCase = {
    execute: vi.fn(),
  };

  const mockRetryFailedBatchUseCase = {
    execute: vi.fn(),
  };

  const mockListBatchesUseCase = {
    execute: vi.fn(),
  };

  const mockGetBatchUseCase = {
    execute: vi.fn(),
  };

  const mockGetBatchStatsUseCase = {
    execute: vi.fn(),
  };

  const mockArchiveBatchUseCase = {
    execute: vi.fn(),
  };

  const mockRestoreBatchUseCase = {
    execute: vi.fn(),
  };

  let controller: AdminBatchController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AdminBatchController(
      mockListBatchesUseCase as any,
      mockGetBatchUseCase as any,
      mockGetBatchStatsUseCase as any,
      mockArchiveBatchUseCase as any,
      mockRestoreBatchUseCase as any,
      mockStopBatchUseCase as any,
      mockResumeBatchUseCase as any,
      mockRetryFailedBatchUseCase as any,
    );
  });

  describe("AdminBatchController Operational Actions", () => {
    it("successfully aborts an active batch", async () => {
      mockStopBatchUseCase.execute.mockResolvedValueOnce({
        batchId: "batch-1",
        status: "STOPPED",
        message: "Batch stopped successfully",
        bolnaStopped: true,
      });

      const req = {
        query: { tenantId: "tenant-1", campaignId: "camp-1" },
        params: { id: "batch-1" },
        body: {},
      } as unknown as Request;

      const jsonMock = vi.fn();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: jsonMock,
      } as unknown as Response;
      const next = vi.fn();

      await controller.abort(req, res, next);

      expect(mockStopBatchUseCase.execute).toHaveBeenCalledWith(
        "tenant-1",
        "camp-1",
        "batch-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Batch aborted by Admin",
        }),
      );
    });

    it("auto-resolves campaignId from database if omitted from query in abort", async () => {
      (prisma.leadBatch.findUnique as any).mockResolvedValueOnce({
        campaignId: "camp-auto",
      });
      mockStopBatchUseCase.execute.mockResolvedValueOnce({
        batchId: "batch-2",
        status: "STOPPED",
      });

      const req = {
        query: { tenantId: "tenant-1" },
        params: { id: "batch-2" },
        body: {},
      } as unknown as Request;

      const jsonMock = vi.fn();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: jsonMock,
      } as unknown as Response;
      const next = vi.fn();

      await controller.abort(req, res, next);

      expect(prisma.leadBatch.findUnique).toHaveBeenCalledWith({
        where: { id: "batch-2" },
        select: { campaignId: true },
      });
      expect(mockStopBatchUseCase.execute).toHaveBeenCalledWith(
        "tenant-1",
        "camp-auto",
        "batch-2",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("successfully resumes a stopped batch", async () => {
      mockResumeBatchUseCase.execute.mockResolvedValueOnce({
        originalBatchId: "batch-1",
        newBatch: { id: "batch-new", status: "RUNNING" },
        remainingLeads: 25,
        message: "New batch created",
      });

      const req = {
        query: { tenantId: "tenant-1", campaignId: "camp-1" },
        params: { id: "batch-1" },
        body: {},
      } as unknown as Request;

      const jsonMock = vi.fn();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: jsonMock,
      } as unknown as Response;
      const next = vi.fn();

      await controller.resume(req, res, next);

      expect(mockResumeBatchUseCase.execute).toHaveBeenCalledWith(
        "tenant-1",
        "camp-1",
        "batch-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Batch resumed by Admin",
        }),
      );
    });

    it("successfully triggers retry for failed leads in batch", async () => {
      mockRetryFailedBatchUseCase.execute.mockResolvedValueOnce({
        batchId: "batch-1",
        retriedCount: 10,
        message: "Successfully queued 10 failed leads for retry.",
      });

      const req = {
        query: { tenantId: "tenant-1", campaignId: "camp-1" },
        params: { id: "batch-1" },
        body: {},
      } as unknown as Request;

      const jsonMock = vi.fn();
      const res = {
        status: vi.fn().mockReturnThis(),
        json: jsonMock,
      } as unknown as Response;
      const next = vi.fn();

      await controller.retryFailed(req, res, next);

      expect(mockRetryFailedBatchUseCase.execute).toHaveBeenCalledWith(
        "tenant-1",
        "camp-1",
        "batch-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Successfully queued 10 failed leads for retry.",
        }),
      );
    });
  });

  describe("RetryFailedBatchUseCase", () => {
    let useCase: RetryFailedBatchUseCase;

    beforeEach(() => {
      useCase = new RetryFailedBatchUseCase(
        mockBatchRepo as any,
        mockCampaignRepo as any,
        mockResumeBatchUseCase as any,
      );
    });

    it("throws CampaignNotFoundError when campaign does not exist", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute("tenant-1", "camp-missing", "batch-1"),
      ).rejects.toThrow(CampaignNotFoundError);
    });

    it("throws BatchNotFoundError when batch does not exist", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({ id: "camp-1" });
      mockBatchRepo.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute("tenant-1", "camp-1", "batch-missing"),
      ).rejects.toThrow(BatchNotFoundError);
    });

    it("returns zero retried count when no failed leads exist", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({ id: "camp-1" });
      mockBatchRepo.findById.mockResolvedValueOnce({ id: "batch-1", status: "COMPLETED" });
      (prisma.lead.findMany as any).mockResolvedValueOnce([]);

      const result = await useCase.execute("tenant-1", "camp-1", "batch-1");

      expect(result.retriedCount).toBe(0);
      expect(result.message).toContain("No eligible failed leads to retry");
      expect(mockResumeBatchUseCase.execute).not.toHaveBeenCalled();
    });

    it("resets failed leads and executes resumeBatchUseCase when failed leads exist", async () => {
      mockCampaignRepo.findById.mockResolvedValueOnce({ id: "camp-1" });
      mockBatchRepo.findById.mockResolvedValueOnce({ id: "batch-1", status: "COMPLETED" });
      (prisma.lead.findMany as any).mockResolvedValueOnce([
        { id: "lead-f1" },
        { id: "lead-f2" },
      ]);
      (prisma.lead.updateMany as any).mockResolvedValueOnce({ count: 2 });
      mockBatchRepo.update.mockResolvedValueOnce({ id: "batch-1", status: "STOPPED" });
      mockResumeBatchUseCase.execute.mockResolvedValueOnce({
        originalBatchId: "batch-1",
        newBatch: { id: "batch-new", status: "RUNNING" },
      });

      const result = await useCase.execute("tenant-1", "camp-1", "batch-1");

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["lead-f1", "lead-f2"] } },
        data: { status: "STOPPED", stoppedReason: null },
      });
      expect(mockBatchRepo.update).toHaveBeenCalledWith("batch-1", {
        status: "STOPPED",
      });
      expect(mockResumeBatchUseCase.execute).toHaveBeenCalledWith(
        "tenant-1",
        "camp-1",
        "batch-1",
      );
      expect(result.retriedCount).toBe(2);
      expect(result.message).toContain("Successfully queued 2 failed leads");
    });
  });
});
