import { describe, it, expect } from "vitest";
import {
  deduplicateInFileLeads,
  deduplicateCrossBatchLeads,
} from "../../../src/modules/leads/domain/rules/lead-dedup.rules";
import type { LeadRow } from "../../../src/modules/leads/infrastructure/leadParser";

describe("Lead Deduplication Domain Rules (Module 8)", () => {
  describe("deduplicateInFileLeads", () => {
    it("returns empty arrays when input rows is empty", () => {
      const result = deduplicateInFileLeads([]);
      expect(result.uniqueRows).toEqual([]);
      expect(result.duplicatePhones).toEqual([]);
    });

    it("retains all rows when there are no duplicates in the file", () => {
      const rows: LeadRow[] = [
        { name: "Alice", phone: "+919876543210" },
        { name: "Bob", phone: "+919876543211" },
        { name: "Charlie", phone: "+919876543212" },
      ];

      const result = deduplicateInFileLeads(rows);

      expect(result.uniqueRows).toHaveLength(3);
      expect(result.uniqueRows).toEqual(rows);
      expect(result.duplicatePhones).toEqual([]);
    });

    it("filters duplicates and preserves the first occurrence of each unique phone", () => {
      const rows: LeadRow[] = [
        { name: "Alice First", phone: "+919876543210" },
        { name: "Alice Duplicate", phone: "+919876543210" },
        { name: "Bob First", phone: "+919876543211" },
        { name: "Alice Triplicate", phone: "+919876543210" },
      ];

      const result = deduplicateInFileLeads(rows);

      expect(result.uniqueRows).toHaveLength(2);
      expect(result.uniqueRows[0]).toEqual({
        name: "Alice First",
        phone: "+919876543210",
      });
      expect(result.uniqueRows[1]).toEqual({
        name: "Bob First",
        phone: "+919876543211",
      });
      expect(result.duplicatePhones).toEqual([
        "+919876543210",
        "+919876543210",
      ]);
    });

    it("handles an input where all rows have the same phone number", () => {
      const rows: LeadRow[] = [
        { name: "One", phone: "+919876543210" },
        { name: "Two", phone: "+919876543210" },
        { name: "Three", phone: "+919876543210" },
      ];

      const result = deduplicateInFileLeads(rows);

      expect(result.uniqueRows).toHaveLength(1);
      expect(result.uniqueRows[0].name).toBe("One");
      expect(result.duplicatePhones).toEqual([
        "+919876543210",
        "+919876543210",
      ]);
    });
  });

  describe("deduplicateCrossBatchLeads", () => {
    it("returns all rows as new when existingPhones set is empty", () => {
      const rows: LeadRow[] = [
        { name: "Alice", phone: "+919876543210" },
        { name: "Bob", phone: "+919876543211" },
      ];

      const result = deduplicateCrossBatchLeads(rows, new Set());

      expect(result.newLeads).toEqual(rows);
      expect(result.duplicatePhones).toEqual([]);
    });

    it("filters out leads that already exist in previous batches in the database", () => {
      const rows: LeadRow[] = [
        { name: "Alice New", phone: "+919876543210" },
        { name: "Bob Existing", phone: "+919876543211" },
        { name: "Charlie New", phone: "+919876543212" },
      ];

      const existingPhones = new Set(["+919876543211"]);

      const result = deduplicateCrossBatchLeads(rows, existingPhones);

      expect(result.newLeads).toHaveLength(2);
      expect(result.newLeads).toEqual([
        { name: "Alice New", phone: "+919876543210" },
        { name: "Charlie New", phone: "+919876543212" },
      ]);
      expect(result.duplicatePhones).toEqual(["+919876543211"]);
    });

    it("marks all leads as duplicate when all phones exist in previous batches", () => {
      const rows: LeadRow[] = [
        { name: "Alice", phone: "+919876543210" },
        { name: "Bob", phone: "+919876543211" },
      ];

      const existingPhones = new Set(["+919876543210", "+919876543211"]);

      const result = deduplicateCrossBatchLeads(rows, existingPhones);

      expect(result.newLeads).toEqual([]);
      expect(result.duplicatePhones).toEqual([
        "+919876543210",
        "+919876543211",
      ]);
    });
  });
});
