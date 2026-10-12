import { describe, it, expect } from "vitest";
import {
  paisaToRupees,
  rupeesToPaisa,
  paisaToRupeesFixed,
  formatPaisa,
} from "../../../src/shared/utils/money";

describe("Monetary Utilities (Module 1)", () => {
  describe("paisaToRupees", () => {
    it("converts integer paisa to rupees correctly", () => {
      expect(paisaToRupees(100)).toBe(1);
      expect(paisaToRupees(50000)).toBe(500);
      expect(paisaToRupees(1999900)).toBe(19999);
      expect(paisaToRupees(50)).toBe(0.5);
      expect(paisaToRupees(0)).toBe(0);
    });
  });

  describe("rupeesToPaisa", () => {
    it("converts rupees float to integer paisa rounding correctly", () => {
      expect(rupeesToPaisa(1)).toBe(100);
      expect(rupeesToPaisa(500)).toBe(50000);
      expect(rupeesToPaisa(19.99)).toBe(1999);
      expect(rupeesToPaisa(0.01)).toBe(1);
      expect(rupeesToPaisa(0)).toBe(0);
    });

    it("handles floating point representation accurately", () => {
      // 0.1 + 0.2 = 0.30000000000000004
      expect(rupeesToPaisa(0.1 + 0.2)).toBe(30);
    });
  });

  describe("paisaToRupeesFixed", () => {
    it("formats paisa to fixed decimal string", () => {
      expect(paisaToRupeesFixed(50000)).toBe("500.00");
      expect(paisaToRupeesFixed(12345)).toBe("123.45");
      expect(paisaToRupeesFixed(0)).toBe("0.00");
      expect(paisaToRupeesFixed(12345, 1)).toBe("123.5");
    });
  });

  describe("formatPaisa", () => {
    it("formats paisa as localized Indian currency string", () => {
      const formatted = formatPaisa(1999900);
      expect(formatted).toContain("19,999.00");
      expect(formatted).toContain("₹");
    });
  });
});
