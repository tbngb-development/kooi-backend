import { describe, it, expect } from "vitest";
import {
  LeadBatchEntity,
  type LeadBatchEntityData,
} from "../../../src/modules/batches/domain/entities/lead-batch.entity";
import { InvalidBatchStatusTransitionError } from "../../../src/modules/batches/domain/errors/batch.errors";

describe("LeadBatchEntity (Domain Unit)", () => {
  const baseData: LeadBatchEntityData = {
    id: "batch-111",
    bolnaBatchId: "bolna-batch-xyz",
    tenantId: "tenant-aaa",
    campaignId: "campaign-ccc",
    status: "CREATED",
    fileName: "leads.csv",
    originalFileUrl: "https://cloudinary.com/leads.csv",
    transformedCsvUrl: null,
    retryConfig: { enabled: true, maxRetries: 2, retryIntervalMinutes: 30 },
    scheduledAt: null,
    bolnaScheduledAt: null,
    totalLeads: 100,
    calledLeads: 0,
    completedLeads: 0,
    failedLeads: 0,
    termsAccepted: true,
    termsAcceptedAt: new Date("2026-01-01T00:00:00Z"),
    termsVersion: "v1.0",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    deletedAt: null,
  };

  it("exposes entity fields via getters", () => {
    const entity = new LeadBatchEntity(baseData);
    expect(entity.id).toBe("batch-111");
    expect(entity.status).toBe("CREATED");
    expect(entity.bolnaBatchId).toBe("bolna-batch-xyz");
    expect(entity.campaignId).toBe("campaign-ccc");
    expect(entity.isDeleted).toBe(false);
    expect(entity.deletedAt).toBeNull();
  });

  describe("canRun and canSchedule", () => {
    it("allows run and schedule when status is CREATED and bolnaBatchId is present", () => {
      const entity = new LeadBatchEntity({ ...baseData, status: "CREATED", bolnaBatchId: "bolna-123" });
      expect(entity.canRun()).toBe(true);
      expect(entity.canSchedule()).toBe(true);
    });

    it("disallows run and schedule when bolnaBatchId is null", () => {
      const entity = new LeadBatchEntity({ ...baseData, status: "CREATED", bolnaBatchId: null });
      expect(entity.canRun()).toBe(false);
      expect(entity.canSchedule()).toBe(false);
    });

    it("disallows run and schedule when status is not CREATED", () => {
      const entity = new LeadBatchEntity({ ...baseData, status: "RUNNING", bolnaBatchId: "bolna-123" });
      expect(entity.canRun()).toBe(false);
      expect(entity.canSchedule()).toBe(false);
    });
  });

  describe("canStop", () => {
    it("allows stopping only when status is SCHEDULED or RUNNING", () => {
      expect(new LeadBatchEntity({ ...baseData, status: "SCHEDULED" }).canStop()).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "RUNNING" }).canStop()).toBe(true);

      expect(new LeadBatchEntity({ ...baseData, status: "CREATED" }).canStop()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "PROCESSING" }).canStop()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "STOPPED" }).canStop()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "COMPLETED" }).canStop()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "FAILED" }).canStop()).toBe(false);
    });
  });

  describe("canResume", () => {
    it("allows resume only when status is STOPPED", () => {
      expect(new LeadBatchEntity({ ...baseData, status: "STOPPED" }).canResume()).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "RUNNING" }).canResume()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "CREATED" }).canResume()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "COMPLETED" }).canResume()).toBe(false);
    });
  });

  describe("canDelete", () => {
    it("disallows delete when batch is active (SCHEDULED or RUNNING)", () => {
      expect(new LeadBatchEntity({ ...baseData, status: "SCHEDULED" }).canDelete()).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "RUNNING" }).canDelete()).toBe(false);

      expect(new LeadBatchEntity({ ...baseData, status: "CREATED" }).canDelete()).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "STOPPED" }).canDelete()).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "COMPLETED" }).canDelete()).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "FAILED" }).canDelete()).toBe(true);
    });
  });

  describe("isArchivable", () => {
    it("allows archival only when batch is neither active nor processing", () => {
      expect(new LeadBatchEntity({ ...baseData, status: "CREATED" }).isArchivable).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "STOPPED" }).isArchivable).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "COMPLETED" }).isArchivable).toBe(true);
      expect(new LeadBatchEntity({ ...baseData, status: "FAILED" }).isArchivable).toBe(true);

      expect(new LeadBatchEntity({ ...baseData, status: "PROCESSING" }).isArchivable).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "RUNNING" }).isArchivable).toBe(false);
      expect(new LeadBatchEntity({ ...baseData, status: "SCHEDULED" }).isArchivable).toBe(false);
    });
  });

  describe("validateTransition", () => {
    it("succeeds when transition is valid", () => {
      const entity = new LeadBatchEntity({ ...baseData, status: "CREATED" });
      expect(() => entity.validateTransition("RUNNING")).not.toThrow();
    });

    it("throws InvalidBatchStatusTransitionError when transition is invalid", () => {
      const entity = new LeadBatchEntity({ ...baseData, status: "CREATED" });
      expect(() => entity.validateTransition("COMPLETED")).toThrow(
        InvalidBatchStatusTransitionError,
      );
    });
  });

  describe("toPrimitives", () => {
    it("returns shallow copy of underlying entity data", () => {
      const entity = new LeadBatchEntity(baseData);
      const primitives = entity.toPrimitives();
      expect(primitives).toEqual(baseData);
      expect(primitives).not.toBe(baseData);
    });
  });
});
