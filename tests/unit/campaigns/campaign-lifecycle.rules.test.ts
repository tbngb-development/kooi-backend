import { describe, it, expect } from "vitest";
import { evaluateCampaignStatusFromBatches } from "../../../src/modules/campaigns/domain/rules/campaign-lifecycle.rules";
import {
  canTransitionCampaignStatus,
  getValidCampaignTransitions,
} from "../../../src/modules/campaigns/domain/entities/campaign-status.rules";
import type { BatchStatus, CampaignStatus } from "@prisma/client";

describe("Campaign Lifecycle & Status Transition Domain Rules (Module 7)", () => {
  describe("evaluateCampaignStatusFromBatches", () => {
    it("returns null when there are no batches in the campaign", () => {
      expect(evaluateCampaignStatusFromBatches([])).toBeNull();
    });

    it("returns RUNNING when at least one batch is currently RUNNING, SCHEDULED, or PROCESSING", () => {
      expect(
        evaluateCampaignStatusFromBatches(["COMPLETED", "RUNNING", "FAILED"]),
      ).toBe("RUNNING");

      expect(
        evaluateCampaignStatusFromBatches(["SCHEDULED", "COMPLETED"]),
      ).toBe("RUNNING");

      expect(
        evaluateCampaignStatusFromBatches(["PROCESSING", "STOPPED"]),
      ).toBe("RUNNING");
    });

    it("returns RUNNING when any batch is unstarted (CREATED)", () => {
      expect(
        evaluateCampaignStatusFromBatches(["COMPLETED", "CREATED"]),
      ).toBe("RUNNING");

      expect(
        evaluateCampaignStatusFromBatches(["CREATED"]),
      ).toBe("RUNNING");
    });

    it("returns FAILED when all executed batches have FAILED and none are active or unstarted", () => {
      expect(
        evaluateCampaignStatusFromBatches(["FAILED"]),
      ).toBe("FAILED");

      expect(
        evaluateCampaignStatusFromBatches(["FAILED", "FAILED", "FAILED"]),
      ).toBe("FAILED");
    });

    it("returns COMPLETED when at least one batch is COMPLETED or STOPPED and all work is terminal", () => {
      expect(
        evaluateCampaignStatusFromBatches(["COMPLETED", "FAILED"]),
      ).toBe("COMPLETED");

      expect(
        evaluateCampaignStatusFromBatches(["STOPPED", "FAILED"]),
      ).toBe("COMPLETED");

      expect(
        evaluateCampaignStatusFromBatches(["COMPLETED", "STOPPED"]),
      ).toBe("COMPLETED");
    });
  });

  describe("canTransitionCampaignStatus & getValidCampaignTransitions", () => {
    it("permits no-op transitions (from === to)", () => {
      const statuses: CampaignStatus[] = ["DRAFT", "RUNNING", "COMPLETED", "FAILED"];
      for (const status of statuses) {
        expect(canTransitionCampaignStatus(status, status)).toBe(true);
      }
    });

    it("permits DRAFT to transition only to RUNNING or FAILED", () => {
      expect(canTransitionCampaignStatus("DRAFT", "RUNNING")).toBe(true);
      expect(canTransitionCampaignStatus("DRAFT", "FAILED")).toBe(true);
      expect(canTransitionCampaignStatus("DRAFT", "COMPLETED")).toBe(false);
      expect(getValidCampaignTransitions("DRAFT")).toEqual(["RUNNING", "FAILED"]);
    });

    it("permits RUNNING to transition to COMPLETED, FAILED, or DRAFT", () => {
      expect(canTransitionCampaignStatus("RUNNING", "COMPLETED")).toBe(true);
      expect(canTransitionCampaignStatus("RUNNING", "FAILED")).toBe(true);
      expect(canTransitionCampaignStatus("RUNNING", "DRAFT")).toBe(true);
      expect(getValidCampaignTransitions("RUNNING")).toEqual([
        "COMPLETED",
        "FAILED",
        "DRAFT",
      ]);
    });

    it("forbids transitions from terminal states COMPLETED and FAILED", () => {
      expect(canTransitionCampaignStatus("COMPLETED", "RUNNING")).toBe(false);
      expect(canTransitionCampaignStatus("COMPLETED", "DRAFT")).toBe(false);
      expect(canTransitionCampaignStatus("COMPLETED", "FAILED")).toBe(false);
      expect(getValidCampaignTransitions("COMPLETED")).toEqual([]);

      expect(canTransitionCampaignStatus("FAILED", "RUNNING")).toBe(false);
      expect(canTransitionCampaignStatus("FAILED", "DRAFT")).toBe(false);
      expect(canTransitionCampaignStatus("FAILED", "COMPLETED")).toBe(false);
      expect(getValidCampaignTransitions("FAILED")).toEqual([]);
    });
  });
});
