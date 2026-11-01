// modules/batches/domain/rules/__tests__/bolna-filename.rules.spec.ts

import { describe, it, expect } from "vitest";
import {
  formatBatchSequence,
  shortenEntityId,
  slugifyCampaignName,
  generateBatchDisplayName,
  generateBolnaBatchFilename,
} from "../bolna-filename.rules";

describe("Bolna Filename Rules", () => {
  describe("formatBatchSequence", () => {
    it("formats with BTH prefix and 3-digit zero-padding", () => {
      expect(formatBatchSequence(1)).toBe("BTH001");
      expect(formatBatchSequence(2)).toBe("BTH002");
      expect(formatBatchSequence(3)).toBe("BTH003");
      expect(formatBatchSequence(9)).toBe("BTH009");
      expect(formatBatchSequence(10)).toBe("BTH010");
      expect(formatBatchSequence(99)).toBe("BTH099");
      expect(formatBatchSequence(100)).toBe("BTH100");
    });

    it("does not truncate sequence numbers exceeding 3 digits", () => {
      expect(formatBatchSequence(1000)).toBe("BTH1000");
      expect(formatBatchSequence(12345)).toBe("BTH12345");
    });

    it("throws error for zero, negative, or non-integer sequence numbers", () => {
      expect(() => formatBatchSequence(0)).toThrow("positive integer");
      expect(() => formatBatchSequence(-1)).toThrow("positive integer");
      expect(() => formatBatchSequence(1.5)).toThrow("positive integer");
      expect(() => formatBatchSequence(NaN)).toThrow("positive integer");
    });
  });

  describe("shortenEntityId", () => {
    it("shortens standard UUIDs to 8 characters with appropriate prefix", () => {
      const batchUuid = "8f21e4b3-3a1b-4c2d-9e5f-1a2b3c4d5e6f";
      const campaignUuid = "a91d7c2e-4b3c-2a1f-8e9d-0c1b2a3f4e5d";

      expect(shortenEntityId(batchUuid, "lb")).toBe("lb_8f21e4b3");
      expect(shortenEntityId(campaignUuid, "cmp")).toBe("cmp_a91d7c2e");
    });

    it("strips hyphens, underscores, and whitespace correctly", () => {
      expect(shortenEntityId("a-b_c-d-1-2-3-4-5", "lb")).toBe("lb_abcd1234");
      expect(shortenEntityId("  8f21e4b3-3a1b  ", "cmp")).toBe("cmp_8f21e4b3");
    });

    it("converts uppercase characters to lowercase", () => {
      expect(shortenEntityId("8F21E4B3-ABCD", "lb")).toBe("lb_8f21e4b3");
    });

    it("throws when ID is too short to be unique", () => {
      expect(() => shortenEntityId("ab", "lb")).toThrow("too short");
      expect(() => shortenEntityId("", "cmp")).toThrow("non-empty string");
    });
  });

  describe("slugifyCampaignName", () => {
    it("slugifies simple campaign names", () => {
      expect(slugifyCampaignName("Winter Sale 2026!")).toBe("winter-sale-2026");
      expect(slugifyCampaignName("Real Estate & Mortgage Leads")).toBe(
        "real-estate-mortgage-leads",
      );
    });

    it("handles multiple punctuation marks and whitespace", () => {
      expect(slugifyCampaignName("  Campaign / Test -- Demo #1  ")).toBe(
        "campaign-test-demo-1",
      );
    });

    it("truncates names exceeding 40 characters without trailing hyphens", () => {
      const longName = "A Very Long Campaign Name That Should Definitely Be Truncated Cleanly";
      const slug = slugifyCampaignName(longName);
      expect(slug.length).toBeLessThanOrEqual(40);
      expect(slug).not.toMatch(/-$/);
      expect(slug).toBe("a-very-long-campaign-name-that-should-de");
    });

    it("falls back to cmp_<shortId> or 'campaign' when name is empty or pure punctuation", () => {
      expect(slugifyCampaignName("", "a91d7c2e-4b3c-2a1f")).toBe("cmp_a91d7c2e");
      expect(slugifyCampaignName("???!!!", "a91d7c2e-4b3c-2a1f")).toBe("cmp_a91d7c2e");
      expect(slugifyCampaignName(undefined, undefined)).toBe("campaign");
    });
  });

  describe("generateBolnaBatchFilename", () => {
    const validBatchId = "8f21e4b3-3a1b-4c2d-9e5f-1a2b3c4d5e6f";
    const validCampaignId = "a91d7c2e-4b3c-2a1f-8e9d-0c1b2a3f4e5d";

    it("generates correct filename matching BTH001-campaignName-lead_batch_id.csv convention", () => {
      const filename = generateBolnaBatchFilename({
        sequenceNumber: 1,
        batchId: validBatchId,
        campaignName: "Winter Sale 2026",
        campaignId: validCampaignId,
      });

      expect(filename).toBe("BTH001-winter-sale-2026-lb_8f21e4b3.csv");
    });

    it("always ends with strictly .csv extension", () => {
      const filename = generateBolnaBatchFilename({
        sequenceNumber: 1,
        batchId: validBatchId,
        campaignName: "My Campaign",
        campaignId: validCampaignId,
      });

      expect(filename.endsWith(".csv")).toBe(true);
      expect(filename.match(/\.csv$/)).toBeTruthy();
    });

    it("produces deterministic filenames for identical inputs", () => {
      const fn1 = generateBolnaBatchFilename({
        sequenceNumber: 7,
        batchId: validBatchId,
        campaignName: "Promo Q4",
        campaignId: validCampaignId,
      });

      const fn2 = generateBolnaBatchFilename({
        sequenceNumber: 7,
        batchId: validBatchId,
        campaignName: "Promo Q4",
        campaignId: validCampaignId,
      });

      expect(fn1).toBe(fn2);
    });

    it("produces unique filenames for different lead batches within the same campaign", () => {
      const batchIdA = "11112222-aaaa-bbbb-cccc-333344445555";
      const batchIdB = "99998888-xxxx-yyyy-zzzz-777766665555";

      const filenameA = generateBolnaBatchFilename({
        sequenceNumber: 1,
        batchId: batchIdA,
        campaignName: "Promo Q4",
        campaignId: validCampaignId,
      });

      const filenameB = generateBolnaBatchFilename({
        sequenceNumber: 2,
        batchId: batchIdB,
        campaignName: "Promo Q4",
        campaignId: validCampaignId,
      });

      expect(filenameA).not.toBe(filenameB);
      expect(filenameA).toBe("BTH001-promo-q4-lb_11112222.csv");
      expect(filenameB).toBe("BTH002-promo-q4-lb_99998888.csv");
    });

    it("produces unique filenames for different campaigns with distinct names", () => {
      const filenameA = generateBolnaBatchFilename({
        sequenceNumber: 1,
        batchId: validBatchId,
        campaignName: "Retail Store",
        campaignId: validCampaignId,
      });

      const filenameB = generateBolnaBatchFilename({
        sequenceNumber: 1,
        batchId: validBatchId,
        campaignName: "Online Shop",
        campaignId: validCampaignId,
      });

      expect(filenameA).not.toBe(filenameB);
      expect(filenameA).toBe("BTH001-retail-store-lb_8f21e4b3.csv");
      expect(filenameB).toBe("BTH001-online-shop-lb_8f21e4b3.csv");
    });

    it("satisfies character constraints without invalid filesystem characters", () => {
      const filename = generateBolnaBatchFilename({
        sequenceNumber: 12,
        batchId: validBatchId,
        campaignName: "Special & Exclusive (US/IN)",
        campaignId: validCampaignId,
      });

      expect(filename).toBe("BTH012-special-exclusive-us-in-lb_8f21e4b3.csv");
      expect(filename).not.toMatch(/[\s\\/:*?"<>|]/);
      expect(filename).toMatch(/^BTH\d{3,}-[a-z0-9-]+-lb_[a-z0-9]{4,16}\.csv$/);
    });
  });

  describe("generateBatchDisplayName", () => {
    const validBatchId = "8f21e4b3-3a1b-4c2d-9e5f-1a2b3c4d5e6f";
    const validCampaignId = "a91d7c2e-4b3c-2a1f-8e9d-0c1b2a3f4e5d";

    it("generates display name omitting the .csv extension", () => {
      const name = generateBatchDisplayName({
        sequenceNumber: 1,
        batchId: validBatchId,
        campaignName: "Winter Sale 2026",
        campaignId: validCampaignId,
      });

      expect(name).toBe("BTH001-winter-sale-2026-lb_8f21e4b3");
      expect(name.endsWith(".csv")).toBe(false);
    });

    it("synchronizes exactly with generateBolnaBatchFilename except for extension", () => {
      const params = {
        sequenceNumber: 3,
        batchId: validBatchId,
        campaignName: "Summer Promo Special",
        campaignId: validCampaignId,
      };

      const displayName = generateBatchDisplayName(params);
      const bolnaFilename = generateBolnaBatchFilename(params);

      expect(bolnaFilename).toBe(`${displayName}.csv`);
    });
  });
});
