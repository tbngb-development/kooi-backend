import { describe, it, expect } from "vitest";
import {
  isValidE164,
  normalizePhoneNumber,
  validatePhoneNumberFormat,
} from "../../../src/modules/phone-numbers/domain/rules/phone-number.rules";

describe("PhoneNumberRules", () => {
  describe("isValidE164", () => {
    it("should accept valid E.164 phone numbers", () => {
      expect(isValidE164("+919876543210")).toBe(true);
      expect(isValidE164("+14155552671")).toBe(true);
      expect(isValidE164("+442071838750")).toBe(true);
      expect(isValidE164("+971501234567")).toBe(true);
    });

    it("should reject invalid phone numbers", () => {
      expect(isValidE164("9876543210")).toBe(false);
      expect(isValidE164("+0123456789")).toBe(false);
      expect(isValidE164("+12345")).toBe(false); // too short
      expect(isValidE164("+12345678901234567")).toBe(false); // too long
      expect(isValidE164("")).toBe(false);
      expect(isValidE164("+91 9876 543210")).toBe(false); // contains spaces
    });
  });

  describe("normalizePhoneNumber", () => {
    it("should normalize 10-digit Indian numbers with +91 prefix", () => {
      expect(normalizePhoneNumber("9876543210")).toBe("+919876543210");
      expect(normalizePhoneNumber("09876543210")).toBe("+919876543210");
    });

    it("should preserve already formatted E.164 numbers", () => {
      expect(normalizePhoneNumber("+919876543210")).toBe("+919876543210");
      expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
    });

    it("should strip spaces, dashes, and parentheses", () => {
      expect(normalizePhoneNumber("+91 (987) 654-3210")).toBe("+919876543210");
    });
  });

  describe("validatePhoneNumberFormat", () => {
    it("should return valid and normalized phone number", () => {
      const res = validatePhoneNumberFormat("9876543210");
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe("+919876543210");
      expect(res.error).toBeUndefined();
    });

    it("should return error for invalid input", () => {
      const res = validatePhoneNumberFormat("abc");
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });
  });
});
