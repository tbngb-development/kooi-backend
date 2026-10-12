import { describe, it, expect } from "vitest";
import {
  canTransitionBatchStatus,
  isBatchActive,
  isBatchProcessing,
  isBatchTerminal,
} from "../../../src/modules/batches/domain/entities/batch-status.rules";
import type { BatchStatus } from "@prisma/client";

describe("Batch Status Rules (Domain Unit)", () => {
  describe("canTransitionBatchStatus", () => {
    it("allows identity transitions (same -> same) as idempotent operations", () => {
      const statuses: BatchStatus[] = [
        "CREATED",
        "PROCESSING",
        "SCHEDULED",
        "RUNNING",
        "STOPPED",
        "COMPLETED",
        "FAILED",
      ];

      for (const status of statuses) {
        expect(canTransitionBatchStatus(status, status)).toBe(true);
      }
    });

    describe("from CREATED", () => {
      it("allows transition to PROCESSING, SCHEDULED, RUNNING, and FAILED", () => {
        expect(canTransitionBatchStatus("CREATED", "PROCESSING")).toBe(true);
        expect(canTransitionBatchStatus("CREATED", "SCHEDULED")).toBe(true);
        expect(canTransitionBatchStatus("CREATED", "RUNNING")).toBe(true);
        expect(canTransitionBatchStatus("CREATED", "FAILED")).toBe(true);
      });

      it("disallows invalid transitions to COMPLETED or STOPPED", () => {
        expect(canTransitionBatchStatus("CREATED", "COMPLETED")).toBe(false);
        expect(canTransitionBatchStatus("CREATED", "STOPPED")).toBe(false);
      });
    });

    describe("from PROCESSING", () => {
      it("allows transition to CREATED, SCHEDULED, RUNNING, and FAILED", () => {
        expect(canTransitionBatchStatus("PROCESSING", "CREATED")).toBe(true);
        expect(canTransitionBatchStatus("PROCESSING", "SCHEDULED")).toBe(true);
        expect(canTransitionBatchStatus("PROCESSING", "RUNNING")).toBe(true);
        expect(canTransitionBatchStatus("PROCESSING", "FAILED")).toBe(true);
      });

      it("disallows direct jump to COMPLETED or STOPPED while in PROCESSING", () => {
        expect(canTransitionBatchStatus("PROCESSING", "COMPLETED")).toBe(false);
        expect(canTransitionBatchStatus("PROCESSING", "STOPPED")).toBe(false);
      });
    });

    describe("from SCHEDULED", () => {
      it("allows transition to RUNNING, STOPPED, and FAILED", () => {
        expect(canTransitionBatchStatus("SCHEDULED", "RUNNING")).toBe(true);
        expect(canTransitionBatchStatus("SCHEDULED", "STOPPED")).toBe(true);
        expect(canTransitionBatchStatus("SCHEDULED", "FAILED")).toBe(true);
      });

      it("disallows invalid transition to CREATED, PROCESSING, or COMPLETED", () => {
        expect(canTransitionBatchStatus("SCHEDULED", "CREATED")).toBe(false);
        expect(canTransitionBatchStatus("SCHEDULED", "PROCESSING")).toBe(false);
        expect(canTransitionBatchStatus("SCHEDULED", "COMPLETED")).toBe(false);
      });
    });

    describe("from RUNNING", () => {
      it("allows transition to COMPLETED, STOPPED, and FAILED", () => {
        expect(canTransitionBatchStatus("RUNNING", "COMPLETED")).toBe(true);
        expect(canTransitionBatchStatus("RUNNING", "STOPPED")).toBe(true);
        expect(canTransitionBatchStatus("RUNNING", "FAILED")).toBe(true);
      });

      it("disallows rewind to CREATED, PROCESSING, or SCHEDULED", () => {
        expect(canTransitionBatchStatus("RUNNING", "CREATED")).toBe(false);
        expect(canTransitionBatchStatus("RUNNING", "PROCESSING")).toBe(false);
        expect(canTransitionBatchStatus("RUNNING", "SCHEDULED")).toBe(false);
      });
    });

    describe("from STOPPED", () => {
      it("allows transition to COMPLETED or resuming to RUNNING", () => {
        expect(canTransitionBatchStatus("STOPPED", "COMPLETED")).toBe(true);
        expect(canTransitionBatchStatus("STOPPED", "RUNNING")).toBe(true);
      });

      it("disallows invalid transition to CREATED, PROCESSING, SCHEDULED, or FAILED", () => {
        expect(canTransitionBatchStatus("STOPPED", "CREATED")).toBe(false);
        expect(canTransitionBatchStatus("STOPPED", "PROCESSING")).toBe(false);
        expect(canTransitionBatchStatus("STOPPED", "SCHEDULED")).toBe(false);
        expect(canTransitionBatchStatus("STOPPED", "FAILED")).toBe(false);
      });
    });

    describe("from COMPLETED", () => {
      it("allows re-running to RUNNING if more calls are triggered", () => {
        expect(canTransitionBatchStatus("COMPLETED", "RUNNING")).toBe(true);
      });

      it("disallows transitioning back to CREATED, PROCESSING, SCHEDULED, STOPPED, or FAILED", () => {
        expect(canTransitionBatchStatus("COMPLETED", "CREATED")).toBe(false);
        expect(canTransitionBatchStatus("COMPLETED", "PROCESSING")).toBe(false);
        expect(canTransitionBatchStatus("COMPLETED", "SCHEDULED")).toBe(false);
        expect(canTransitionBatchStatus("COMPLETED", "STOPPED")).toBe(false);
        expect(canTransitionBatchStatus("COMPLETED", "FAILED")).toBe(false);
      });
    });

    describe("from FAILED", () => {
      it("is strictly terminal and permits no transitions to any other status", () => {
        expect(canTransitionBatchStatus("FAILED", "CREATED")).toBe(false);
        expect(canTransitionBatchStatus("FAILED", "PROCESSING")).toBe(false);
        expect(canTransitionBatchStatus("FAILED", "SCHEDULED")).toBe(false);
        expect(canTransitionBatchStatus("FAILED", "RUNNING")).toBe(false);
        expect(canTransitionBatchStatus("FAILED", "STOPPED")).toBe(false);
        expect(canTransitionBatchStatus("FAILED", "COMPLETED")).toBe(false);
      });
    });
  });

  describe("isBatchActive", () => {
    it("returns true only for SCHEDULED and RUNNING", () => {
      expect(isBatchActive("SCHEDULED")).toBe(true);
      expect(isBatchActive("RUNNING")).toBe(true);

      expect(isBatchActive("CREATED")).toBe(false);
      expect(isBatchActive("PROCESSING")).toBe(false);
      expect(isBatchActive("STOPPED")).toBe(false);
      expect(isBatchActive("COMPLETED")).toBe(false);
      expect(isBatchActive("FAILED")).toBe(false);
    });
  });

  describe("isBatchProcessing", () => {
    it("returns true only for PROCESSING", () => {
      expect(isBatchProcessing("PROCESSING")).toBe(true);

      expect(isBatchProcessing("CREATED")).toBe(false);
      expect(isBatchProcessing("SCHEDULED")).toBe(false);
      expect(isBatchProcessing("RUNNING")).toBe(false);
      expect(isBatchProcessing("STOPPED")).toBe(false);
      expect(isBatchProcessing("COMPLETED")).toBe(false);
      expect(isBatchProcessing("FAILED")).toBe(false);
    });
  });

  describe("isBatchTerminal", () => {
    it("returns true for COMPLETED, STOPPED, and FAILED", () => {
      expect(isBatchTerminal("COMPLETED")).toBe(true);
      expect(isBatchTerminal("STOPPED")).toBe(true);
      expect(isBatchTerminal("FAILED")).toBe(true);

      expect(isBatchTerminal("CREATED")).toBe(false);
      expect(isBatchTerminal("PROCESSING")).toBe(false);
      expect(isBatchTerminal("SCHEDULED")).toBe(false);
      expect(isBatchTerminal("RUNNING")).toBe(false);
    });
  });
});
