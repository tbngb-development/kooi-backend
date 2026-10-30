import { describe, it, expect } from "vitest";
import {
  shortenEntityId,
  formatBatchSequence,
  generateBolnaBatchFilename,
  parseBolnaBatchFilename,
} from "../batch-filename.rules";

describe("batch-filename.rules", () => {
  describe("shortenEntityId", () => {
    it("should extract the first 8 alphanumeric characters of a UUID with prefix", () => {
      const uuid = "8f21e54a-3df1-4a58-86d9-768565261882";
      expect(shortenEntityId(uuid, "lb")).toBe("lb_8f21e54a");
      expect(shortenEntityId(uuid, "cmp")).toBe("cmp_8f21e54a");
    });

    it("should strip pre-existing namespace prefixes to avoid double prefixing", () => {
      expect(shortenEntityId("lb_8f21e54a", "lb")).toBe("lb_8f21e54a");
      expect(shortenEntityId("cmp_a91d034b", "cmp")).toBe("cmp_a91d034b");
      expect(shortenEntityId("lb_8f21e54a", "cmp")).toBe("cmp_8f21e54a");
    });

    it("should support custom length when specified", () => {
      const uuid = "8f21e54a-3df1-4a58";
      expect(shortenEntityId(uuid, "lb", 4)).toBe("lb_8f21");
      expect(shortenEntityId(uuid, "cmp", 12)).toBe("cmp_8f21e54a3df1");
    });

    it("should handle invalid or empty input safely", () => {
      expect(shortenEntityId("", "lb")).toBe("lb_unknown");
      expect(shortenEntityId(null as any, "cmp")).toBe("cmp_unknown");
    });
  });

  describe("formatBatchSequence", () => {
    it("should zero-pad single-digit batch numbers", () => {
      expect(formatBatchSequence(1)).toBe("01");
      expect(formatBatchSequence(3)).toBe("03");
      expect(formatBatchSequence(9)).toBe("09");
    });

    it("should not add extra zero-padding to numbers with 2 or more digits", () => {
      expect(formatBatchSequence(10)).toBe("10");
      expect(formatBatchSequence(42)).toBe("42");
      expect(formatBatchSequence(105)).toBe("105");
    });

    it("should default numbers <= 0 or invalid to '01'", () => {
      expect(formatBatchSequence(0)).toBe("01");
      expect(formatBatchSequence(-5)).toBe("01");
      expect(formatBatchSequence(NaN)).toBe("01");
    });
  });

  describe("generateBolnaBatchFilename", () => {
    it("should format batch filename as batch-{batch-count}-{lead-batch-id}-{campaign-id}.csv", () => {
      const filename = generateBolnaBatchFilename({
        batchSequence: 3,
        batchId: "8f21e54a-3df1-4a58-86d9-768565261882",
        campaignId: "a91d034b-7685-4b21-98a1-348512398412",
      });

      expect(filename).toBe("batch-03-lb_8f21e54a-cmp_a91d034b.csv");
      expect(filename.endsWith(".csv")).toBe(true);
    });

    it("should support 4-char length if needed", () => {
      const filename = generateBolnaBatchFilename({
        batchSequence: 3,
        batchId: "8f21e54a-3df1",
        campaignId: "a91d034b-7685",
        idLength: 4,
      });

      expect(filename).toBe("batch-03-lb_8f21-cmp_a91d.csv");
    });

    it("should generate deterministic filenames for identical inputs", () => {
      const params = {
        batchSequence: 5,
        batchId: "12345678-aaaa-bbbb",
        campaignId: "87654321-cccc-dddd",
      };

      const name1 = generateBolnaBatchFilename(params);
      const name2 = generateBolnaBatchFilename(params);
      expect(name1).toBe(name2);
    });

    it("should produce distinct filenames for different batches in the same campaign", () => {
      const campaignId = "camp-uuid-common-1234";
      const name1 = generateBolnaBatchFilename({
        batchSequence: 1,
        batchId: "batch-uuid-1111",
        campaignId,
      });
      const name2 = generateBolnaBatchFilename({
        batchSequence: 2,
        batchId: "batch-uuid-2222",
        campaignId,
      });

      expect(name1).not.toBe(name2);
      expect(name1).toBe("batch-01-lb_batchuui-cmp_campuuid.csv");
      expect(name2).toBe("batch-02-lb_batchuui-cmp_campuuid.csv");
    });

    it("should produce valid filename with allowed characters only", () => {
      const filename = generateBolnaBatchFilename({
        batchSequence: 12,
        batchId: "550e8400-e29b-41d4-a716-446655440000",
        campaignId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      });

      // Valid filename check: alphanumeric, dashes, underscores, and extension dot
      expect(/^[a-zA-Z0-9_.-]+$/.test(filename)).toBe(true);
    });
  });

  describe("parseBolnaBatchFilename", () => {
    it("should correctly parse valid standardized filenames", () => {
      const parsed = parseBolnaBatchFilename("batch-03-lb_8f21e54a-cmp_a91d034b.csv");
      expect(parsed).toEqual({
        batchSequence: 3,
        shortBatchId: "lb_8f21e54a",
        shortCampaignId: "cmp_a91d034b",
      });
    });

    it("should parse 4-character variants", () => {
      const parsed = parseBolnaBatchFilename("batch-01-lb_8f21-cmp_a91d.csv");
      expect(parsed).toEqual({
        batchSequence: 1,
        shortBatchId: "lb_8f21",
        shortCampaignId: "cmp_a91d",
      });
    });

    it("should return null for non-standard filenames", () => {
      expect(parseBolnaBatchFilename("bolna-123.csv")).toBeNull();
      expect(parseBolnaBatchFilename("resume-456.csv")).toBeNull();
      expect(parseBolnaBatchFilename("batch-01.csv")).toBeNull();
      expect(parseBolnaBatchFilename("")).toBeNull();
      expect(parseBolnaBatchFilename(null as any)).toBeNull();
    });
  });
});
