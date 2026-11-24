import { describe, it, expect } from "vitest";
// modules/campaigns/domain/rules/__tests__/sarvam-status-mapper.spec.ts

import {
  mapSarvamCampaignStatusToKooi,
  mapSarvamCohortStatusToKooi,
} from "../sarvam-status-mapper";

describe("Sarvam Status Mapper", () => {
  describe("mapSarvamCampaignStatusToKooi", () => {
    it("maps scheduled to SCHEDULED", () => {
      expect(mapSarvamCampaignStatusToKooi("scheduled")).toBe("SCHEDULED");
      expect(mapSarvamCampaignStatusToKooi("SCHEDULED")).toBe("SCHEDULED");
      expect(mapSarvamCampaignStatusToKooi("  scheduled  ")).toBe("SCHEDULED");
    });

    it("maps active to RUNNING", () => {
      expect(mapSarvamCampaignStatusToKooi("active")).toBe("RUNNING");
      expect(mapSarvamCampaignStatusToKooi("ACTIVE")).toBe("RUNNING");
    });

    it("maps paused to PAUSED", () => {
      expect(mapSarvamCampaignStatusToKooi("paused")).toBe("PAUSED");
      expect(mapSarvamCampaignStatusToKooi("PAUSED")).toBe("PAUSED");
    });

    it("maps ended to COMPLETED", () => {
      expect(mapSarvamCampaignStatusToKooi("ended")).toBe("COMPLETED");
      expect(mapSarvamCampaignStatusToKooi("ENDED")).toBe("COMPLETED");
    });

    it("maps cancelled to CANCELLED", () => {
      expect(mapSarvamCampaignStatusToKooi("cancelled")).toBe("CANCELLED");
      expect(mapSarvamCampaignStatusToKooi("CANCELLED")).toBe("CANCELLED");
    });

    it("defaults unknown statuses to RUNNING safely", () => {
      expect(mapSarvamCampaignStatusToKooi("unknown")).toBe("RUNNING");
      expect(mapSarvamCampaignStatusToKooi("in_progress")).toBe("RUNNING");
    });
  });

  describe("mapSarvamCohortStatusToKooi", () => {
    it("maps processing to PROCESSING", () => {
      expect(mapSarvamCohortStatusToKooi("processing")).toBe("PROCESSING");
      expect(mapSarvamCohortStatusToKooi("PROCESSING")).toBe("PROCESSING");
    });

    it("maps completed to CREATED", () => {
      expect(mapSarvamCohortStatusToKooi("completed")).toBe("CREATED");
      expect(mapSarvamCohortStatusToKooi("COMPLETED")).toBe("CREATED");
    });

    it("maps failed to FAILED", () => {
      expect(mapSarvamCohortStatusToKooi("failed")).toBe("FAILED");
      expect(mapSarvamCohortStatusToKooi("FAILED")).toBe("FAILED");
    });

    it("defaults unknown cohort status to PROCESSING safely", () => {
      expect(mapSarvamCohortStatusToKooi("pending")).toBe("PROCESSING");
      expect(mapSarvamCohortStatusToKooi("unknown")).toBe("PROCESSING");
    });
  });
});
