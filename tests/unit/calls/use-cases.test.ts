import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetCallUseCase } from "../../../src/modules/calls/application/use-cases/get-call.use-case";
import { GetCallTranscriptUseCase } from "../../../src/modules/calls/application/use-cases/get-call-transcript.use-case";
import { GetCallStatsUseCase } from "../../../src/modules/calls/application/use-cases/get-call-stats.use-case";
import { ListCallsUseCase } from "../../../src/modules/calls/application/use-cases/list-calls.use-case";
import { ArchiveCallUseCase } from "../../../src/modules/calls/application/use-cases/archive-call.use-case";
import { RestoreCallUseCase } from "../../../src/modules/calls/application/use-cases/restore-call.use-case";
import { GetAvailableFiltersUseCase } from "../../../src/modules/calls/application/use-cases/get-available-filters.use-case";
import {
  CallNotFoundError,
  CallAlreadyDeletedError,
  CallNotDeletedError,
} from "../../../src/modules/calls/domain/errors/call.errors";
import type {
  CallRepository,
  DetailedCallResult,
  CallTranscriptResult,
  CallStatsResult,
  PaginatedCallsResult,
} from "../../../src/modules/calls/application/interfaces/call-repository.interface";

describe("Calls Module Use Cases", () => {
  let mockCallRepo: CallRepository;

  const mockDetailedCall: DetailedCallResult = {
    id: "call-1",
    bolnaCallId: "bolna-call-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    leadId: "lead-1",
    batchId: "batch-1",
    status: "COMPLETED",
    duration: 90,
    cost: 120,
    platformCost: 150,
    billableSeconds: 90,
    recording: "https://recordings.bolna.ai/1.mp3",
    transcript: "Agent: Hello\nUser: Hi",
    transcriptMessages: [],
    summary: "Interested",
    callHistory: null,
    extractionResult: null,
    startedAt: new Date(),
    endedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    deletedAt: null,
    lead: {
      id: "lead-1",
      name: "John Doe",
      phone: "+919876543210",
      email: "john@example.com",
      company: "Acme",
    },
    campaign: {
      id: "campaign-1",
      name: "Q4 Outbound",
      description: "Sales",
    },
    callAnalysis: null,
  };

  beforeEach(() => {
    mockCallRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      findTranscriptById: vi.fn(),
      getStats: vi.fn(),
      getTenantCallOverview: vi.fn(),
      getAvailableFilters: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      findInboundLeadContext: vi.fn(),
      createInboundCall: vi.fn(),
    };
  });

  describe("GetCallUseCase", () => {
    it("returns detailed call when found", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue(mockDetailedCall);

      const useCase = new GetCallUseCase(mockCallRepo);
      const result = await useCase.execute("tenant-1", "call-1");

      expect(result).toBe(mockDetailedCall);
      expect(mockCallRepo.findById).toHaveBeenCalledWith("tenant-1", "call-1");
    });

    it("throws CallNotFoundError when call does not exist", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue(null);

      const useCase = new GetCallUseCase(mockCallRepo);
      await expect(useCase.execute("tenant-1", "non-existent")).rejects.toThrow(
        CallNotFoundError,
      );
    });
  });

  describe("GetCallTranscriptUseCase", () => {
    it("returns transcript result when found", async () => {
      const mockTranscript: CallTranscriptResult = {
        transcript: "Agent: Hello\nUser: Yes",
        transcriptMessages: [{ role: "agent", content: "Hello" }],
        summary: "Qualified lead",
        duration: 90,
        recording: "https://recordings.bolna.ai/1.mp3",
        callAnalysis: { id: "analysis-1" },
      };

      vi.mocked(mockCallRepo.findTranscriptById).mockResolvedValue(mockTranscript);

      const useCase = new GetCallTranscriptUseCase(mockCallRepo);
      const result = await useCase.execute("tenant-1", "call-1");

      expect(result).toBe(mockTranscript);
      expect(mockCallRepo.findTranscriptById).toHaveBeenCalledWith("tenant-1", "call-1");
    });

    it("throws CallNotFoundError when transcript is not found", async () => {
      vi.mocked(mockCallRepo.findTranscriptById).mockResolvedValue(null);

      const useCase = new GetCallTranscriptUseCase(mockCallRepo);
      await expect(useCase.execute("tenant-1", "non-existent")).rejects.toThrow(
        CallNotFoundError,
      );
    });
  });

  describe("GetCallStatsUseCase", () => {
    it("delegates to repository getStats with tenantId and filters", async () => {
      const mockStats: CallStatsResult = {
        total: 100,
        completed: 75,
        failed: 5,
        noAnswer: 15,
        busy: 5,
        avgDuration: 85,
      };

      vi.mocked(mockCallRepo.getStats).mockResolvedValue(mockStats);

      const useCase = new GetCallStatsUseCase(mockCallRepo);
      const result = await useCase.execute({
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        leadId: "lead-1",
      });

      expect(result).toBe(mockStats);
      expect(mockCallRepo.getStats).toHaveBeenCalledWith("tenant-1", {
        campaignId: "campaign-1",
        leadId: "lead-1",
      });
    });
  });

  describe("ListCallsUseCase", () => {
    it("delegates to repository list with clean filters", async () => {
      const mockPaginatedResult: PaginatedCallsResult = {
        overview: {
          totalCalls: 1,
          completedCalls: 1,
          totalDuration: 90,
          totalSpend: 150,
        },
        calls: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      vi.mocked(mockCallRepo.list).mockResolvedValue(mockPaginatedResult);

      const useCase = new ListCallsUseCase(mockCallRepo);
      const result = await useCase.execute({
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        status: "COMPLETED",
        page: 1,
        limit: 20,
      });

      expect(result).toBe(mockPaginatedResult);
      expect(mockCallRepo.list).toHaveBeenCalledWith("tenant-1", expect.objectContaining({
        campaignId: "campaign-1",
        status: "COMPLETED",
        page: 1,
        limit: 20,
      }));
    });
  });

  describe("ArchiveCallUseCase", () => {
    it("archives an active call successfully", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue(mockDetailedCall);

      const useCase = new ArchiveCallUseCase(mockCallRepo);
      await useCase.execute("tenant-1", "call-1");

      expect(mockCallRepo.findById).toHaveBeenCalledWith("tenant-1", "call-1");
      expect(mockCallRepo.softDelete).toHaveBeenCalledWith("call-1");
    });

    it("throws CallNotFoundError if call does not exist", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue(null);

      const useCase = new ArchiveCallUseCase(mockCallRepo);
      await expect(useCase.execute("tenant-1", "missing-call")).rejects.toThrow(
        CallNotFoundError,
      );
    });

    it("throws CallAlreadyDeletedError if call is already deleted", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue({
        ...mockDetailedCall,
        isDeleted: true,
      });

      const useCase = new ArchiveCallUseCase(mockCallRepo);
      await expect(useCase.execute("tenant-1", "call-1")).rejects.toThrow(
        CallAlreadyDeletedError,
      );
    });
  });

  describe("RestoreCallUseCase", () => {
    it("restores an archived call successfully", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue({
        ...mockDetailedCall,
        isDeleted: true,
      });

      const useCase = new RestoreCallUseCase(mockCallRepo);
      await useCase.execute("tenant-1", "call-1");

      expect(mockCallRepo.findById).toHaveBeenCalledWith("tenant-1", "call-1");
      expect(mockCallRepo.restore).toHaveBeenCalledWith("call-1");
    });

    it("throws CallNotFoundError if call does not exist", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue(null);

      const useCase = new RestoreCallUseCase(mockCallRepo);
      await expect(useCase.execute("tenant-1", "missing-call")).rejects.toThrow(
        CallNotFoundError,
      );
    });

    it("throws CallNotDeletedError if call is active (not deleted)", async () => {
      vi.mocked(mockCallRepo.findById).mockResolvedValue({
        ...mockDetailedCall,
        isDeleted: false,
      });

      const useCase = new RestoreCallUseCase(mockCallRepo);
      await expect(useCase.execute("tenant-1", "call-1")).rejects.toThrow(
        CallNotDeletedError,
      );
    });
  });

  describe("GetAvailableFiltersUseCase", () => {
    it("returns available filters for campaign", async () => {
      const mockFilters = {
        dispositions: [],
      };

      vi.mocked(mockCallRepo.getAvailableFilters).mockResolvedValue(mockFilters);

      const useCase = new GetAvailableFiltersUseCase(mockCallRepo);
      const result = await useCase.execute("tenant-1", "campaign-1");

      expect(result).toBe(mockFilters);
      expect(mockCallRepo.getAvailableFilters).toHaveBeenCalledWith("tenant-1", "campaign-1");
    });
  });
});
