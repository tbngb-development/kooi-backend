import { describe, it, expect } from "vitest";
import {
  normalizePhoneNumber,
  isValidE164,
  isIndianPhone,
} from "../../../src/modules/leads/domain/rules/phone.rules";

describe("Phone Normalization Rules (Module 1)", () => {
  describe("isValidE164", () => {
    it("returns true for standard Indian E.164 phone numbers", () => {
      expect(isValidE164("+919876543210")).toBe(true);
      expect(isValidE164("+918064261668")).toBe(true);
    });

    it("returns true for valid international E.164 numbers", () => {
      expect(isValidE164("+14155552671")).toBe(true);
      expect(isValidE164("+447911123456")).toBe(true);
      expect(isValidE164("+971501234567")).toBe(true);
    });

    it("returns false for invalid formats", () => {
      expect(isValidE164("9876543210")).toBe(false);
      expect(isValidE164("09876543210")).toBe(false);
      expect(isValidE164("+")).toBe(false);
      expect(isValidE164("+0123456789")).toBe(false); // First digit cannot be 0
      expect(isValidE164("")).toBe(false);
      expect(isValidE164("invalid-phone")).toBe(false);
    });
  });

  describe("normalizePhoneNumber", () => {
    it("normalizes standard 10-digit Indian numbers with +91 prefix", () => {
      expect(normalizePhoneNumber("9876543210")).toBe("+919876543210");
      expect(normalizePhoneNumber("8064261668")).toBe("+918064261668");
    });

    it("strips Indian domestic trunk prefix '0' and adds +91", () => {
      expect(normalizePhoneNumber("09876543210")).toBe("+919876543210");
    });

    it("handles 12-digit numbers starting with 91", () => {
      expect(normalizePhoneNumber("919876543210")).toBe("+919876543210");
    });

    it("strips spaces, dashes, parentheses, and dots", () => {
      expect(normalizePhoneNumber("+91 (987) 654-3210")).toBe("+919876543210");
      expect(normalizePhoneNumber("987-654-3210")).toBe("+919876543210");
      expect(normalizePhoneNumber("987.654.3210")).toBe("+919876543210");
      expect(normalizePhoneNumber(" 09876 543 210 ")).toBe("+919876543210");
    });

    it("converts '00' international dialing prefix to '+'", () => {
      expect(normalizePhoneNumber("00447911123456")).toBe("+447911123456");
      expect(normalizePhoneNumber("0014155552671")).toBe("+14155552671");
    });

    it("preserves already normalized '+' prefixed numbers", () => {
      expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
      expect(normalizePhoneNumber("+919876543210")).toBe("+919876543210");
    });

    it("falls back to default country code when passed explicitly", () => {
      expect(normalizePhoneNumber("1234567890", "1")).toBe("+11234567890");
    });
  });

  describe("isIndianPhone", () => {
    it("identifies domestic 10-digit Indian numbers", () => {
      expect(isIndianPhone("9876543210")).toBe(true);
      expect(isIndianPhone("+919876543210")).toBe(true);
      expect(isIndianPhone("919876543210")).toBe(true);
    });

    it("rejects non-Indian numbers", () => {
      expect(isIndianPhone("+14155552671")).toBe(false);
      expect(isIndianPhone("+447911123456")).toBe(false);
      expect(isIndianPhone("")).toBe(false);
    });
  });
});
