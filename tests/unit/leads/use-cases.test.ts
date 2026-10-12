import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetLeadUseCase } from "../../../src/modules/leads/application/use-cases/get-lead.use-case";
import { ListLeadsUseCase } from "../../../src/modules/leads/application/use-cases/list-leads.use-case";
import { GetLeadStatsUseCase } from "../../../src/modules/leads/application/use-cases/get-lead-stats.use-case";
import { ArchiveLeadUseCase } from "../../../src/modules/leads/application/use-cases/archive-lead.use-case";
import { RestoreLeadUseCase } from "../../../src/modules/leads/application/use-cases/restore-lead.use-case";
import type {
  LeadRepository,
  DetailedLeadResult,
  PaginatedLeadsResult,
  LeadStatsResult,
} from "../../../src/modules/leads/application/interfaces/lead-repository.interface";
import {
  LeadNotFoundError,
  LeadAlreadyDeletedError,
  LeadNotDeletedError,
} from "../../../src/modules/leads/domain/errors/lead.errors";

function createMockLeadRepo(): LeadRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    getStats: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };
}

const mockLead: DetailedLeadResult = {
  id: "lead-123",
  tenantId: "tenant-123",
  campaignId: "camp-123",
  batchId: "batch-123",
  phone: "+919876543210",
  name: "Alice Smith",
  status: "PENDING",
  callCount: 0,
  lastCalledAt: null,
  doNotCall: false,
  metadata: {},
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  campaign: {
    id: "camp-123",
    name: "Winter Campaign",
    description: "Cold leads outreach",
    status: "RUNNING",
  },
  calls: [],
};

describe("Lead Application Use Cases (Module 8)", () => {
  let leadRepo: ReturnType<typeof createMockLeadRepo>;

  beforeEach(() => {
    vi.clearAllMocks();
    leadRepo = createMockLeadRepo();
  });

  describe("GetLeadUseCase", () => {
    it("throws LeadNotFoundError when lead does not exist under tenant", async () => {
      const useCase = new GetLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", "non-existent-id"),
      ).rejects.toThrow(LeadNotFoundError);
    });

    it("returns detailed lead result when found", async () => {
      const useCase = new GetLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue(mockLead);

      const result = await useCase.execute("tenant-123", "lead-123");

      expect(result).toEqual(mockLead);
      expect(leadRepo.findById).toHaveBeenCalledWith("tenant-123", "lead-123");
    });
  });

  describe("ListLeadsUseCase", () => {
    it("delegates to leadRepo.list with given filters", async () => {
      const useCase = new ListLeadsUseCase(leadRepo);
      const mockResult: PaginatedLeadsResult = {
        leads: [],
        pagination: { total: 0, page: 1, limit: 20, pages: 0 },
      };
      vi.mocked(leadRepo.list).mockResolvedValue(mockResult);

      const result = await useCase.execute({
        tenantId: "tenant-123",
        campaignId: "camp-123",
        status: "PENDING",
        page: 1,
        limit: 20,
      });

      expect(result).toEqual(mockResult);
      expect(leadRepo.list).toHaveBeenCalledWith("tenant-123", {
        campaignId: "camp-123",
        status: "PENDING",
        search: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        sortBy: undefined,
        sortOrder: undefined,
        page: 1,
        limit: 20,
        isDeleted: undefined,
      });
    });
  });

  describe("GetLeadStatsUseCase", () => {
    it("delegates to leadRepo.getStats and returns status counts", async () => {
      const useCase = new GetLeadStatsUseCase(leadRepo);
      const mockStats: LeadStatsResult = {
        total: 100,
        pending: 60,
        calling: 10,
        called: 20,
        failed: 5,
        noAnswer: 5,
      };
      vi.mocked(leadRepo.getStats).mockResolvedValue(mockStats);

      const result = await useCase.execute("tenant-123", "camp-123");

      expect(result).toEqual(mockStats);
      expect(leadRepo.getStats).toHaveBeenCalledWith("tenant-123", "camp-123");
    });
  });

  describe("ArchiveLeadUseCase", () => {
    it("throws LeadNotFoundError when lead does not exist", async () => {
      const useCase = new ArchiveLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", "non-existent-lead"),
      ).rejects.toThrow(LeadNotFoundError);
    });

    it("throws LeadAlreadyDeletedError when lead is already archived", async () => {
      const useCase = new ArchiveLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue({
        ...mockLead,
        isDeleted: true,
        deletedAt: new Date(),
      });

      await expect(
        useCase.execute("tenant-123", "lead-123"),
      ).rejects.toThrow(LeadAlreadyDeletedError);
    });

    it("calls leadRepo.softDelete when lead is active", async () => {
      const useCase = new ArchiveLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue(mockLead);

      await useCase.execute("tenant-123", "lead-123");

      expect(leadRepo.softDelete).toHaveBeenCalledWith("lead-123");
    });
  });

  describe("RestoreLeadUseCase", () => {
    it("throws LeadNotFoundError when lead does not exist", async () => {
      const useCase = new RestoreLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute("tenant-123", "non-existent-lead"),
      ).rejects.toThrow(LeadNotFoundError);
    });

    it("throws LeadNotDeletedError when lead is not archived", async () => {
      const useCase = new RestoreLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue({
        ...mockLead,
        isDeleted: false,
      });

      await expect(
        useCase.execute("tenant-123", "lead-123"),
      ).rejects.toThrow(LeadNotDeletedError);
    });

    it("calls leadRepo.restore when lead is archived", async () => {
      const useCase = new RestoreLeadUseCase(leadRepo);
      vi.mocked(leadRepo.findById).mockResolvedValue({
        ...mockLead,
        isDeleted: true,
        deletedAt: new Date(),
      });

      await useCase.execute("tenant-123", "lead-123");

      expect(leadRepo.restore).toHaveBeenCalledWith("lead-123");
    });
  });
});
