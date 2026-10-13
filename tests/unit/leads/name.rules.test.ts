import { describe, it, expect } from "vitest";
import {
  isValidCustomerName,
  cleanCustomerName,
  MIN_CUSTOMER_NAME_LENGTH,
} from "../../../src/modules/leads/domain/rules/name.rules";

describe("Customer Name Parsing & Sanitization Domain Rules (Module 8)", () => {
  describe("isValidCustomerName", () => {
    it("returns false for null, undefined, or whitespace-only names", () => {
      expect(isValidCustomerName(null)).toBe(false);
      expect(isValidCustomerName(undefined)).toBe(false);
      expect(isValidCustomerName("")).toBe(false);
      expect(isValidCustomerName("   ")).toBe(false);
    });

    it("returns false for names with fewer than MIN_CUSTOMER_NAME_LENGTH letters", () => {
      expect(MIN_CUSTOMER_NAME_LENGTH).toBe(3);
      expect(isValidCustomerName("A")).toBe(false);
      expect(isValidCustomerName("N")).toBe(false);
      expect(isValidCustomerName("Jo")).toBe(false);
      expect(isValidCustomerName("123")).toBe(false);
      expect(isValidCustomerName("A 1")).toBe(false);
    });

    it("returns false for placeholder template syntax", () => {
      expect(isValidCustomerName("{{customer_name}}")).toBe(false);
      expect(isValidCustomerName("{name}")).toBe(false);
      expect(isValidCustomerName("<name>")).toBe(false);
      expect(isValidCustomerName("[customer]")).toBe(false);
      expect(isValidCustomerName("(name)")).toBe(false);
    });

    it("returns false for recognized dummy/junk names", () => {
      const junkList = [
        "unknown",
        "null",
        "undefined",
        "unavailable",
        "na",
        "n/a",
        "none",
        "test",
        "user",
        "customer",
        "no name",
        "noname",
      ];

      for (const junk of junkList) {
        expect(isValidCustomerName(junk)).toBe(false);
        expect(isValidCustomerName(junk.toUpperCase())).toBe(false);
      }
    });

    it("returns true for valid conversational names", () => {
      expect(isValidCustomerName("Alice")).toBe(true);
      expect(isValidCustomerName("Raj Kumar")).toBe(true);
      expect(isValidCustomerName("Dr. John Smith")).toBe(true);
      expect(isValidCustomerName("Md. Abbas Firdous")).toBe(true);
    });
  });

  describe("cleanCustomerName", () => {
    it("returns empty string when input is invalid or junk", () => {
      expect(cleanCustomerName(null)).toBe("");
      expect(cleanCustomerName(undefined)).toBe("");
      expect(cleanCustomerName("")).toBe("");
      expect(cleanCustomerName("{{name}}")).toBe("");
      expect(cleanCustomerName("n/a")).toBe("");
    });

    it("strips common honorifics and prefixes to find the first real spoken name", () => {
      expect(cleanCustomerName("Mr. John Doe")).toBe("John");
      expect(cleanCustomerName("Mrs. Jane Doe")).toBe("Jane");
      expect(cleanCustomerName("Dr. Vikram Sharma")).toBe("Vikram");
      expect(cleanCustomerName("Prof. Amit Verma")).toBe("Amit");
      expect(cleanCustomerName("Shri Rajesh Gupta")).toBe("Rajesh");
      expect(cleanCustomerName("Smt. Radha Devi")).toBe("Radha");
      expect(cleanCustomerName("Adv. Sneha Roy")).toBe("Sneha");
    });

    it("discards 1 or 2 letter initials and 3-letter vowel-less abbreviations", () => {
      // "Md." is length 2 -> discarded; "Abbas" -> kept
      expect(cleanCustomerName("Md. Abbas Firdous")).toBe("Abbas");
      // "K. N. Suresh" -> "K" and "N" are length 1 -> discarded; "Suresh" -> kept
      expect(cleanCustomerName("K. N. Suresh")).toBe("Suresh");
      // "Kmr" is 3-letter with no vowels -> discarded; "Pooja" -> kept
      expect(cleanCustomerName("Kmr. Pooja")).toBe("Pooja");
    });

    it("preserves valid 3-letter spoken names with vowels", () => {
      expect(cleanCustomerName("Raj Kumar")).toBe("Raj");
      expect(cleanCustomerName("Ali Khan")).toBe("Ali");
      expect(cleanCustomerName("Sam Wilson")).toBe("Sam");
      expect(cleanCustomerName("Dev Patel")).toBe("Dev");
      expect(cleanCustomerName("Joy Das")).toBe("Joy");
    });

    it("title-cases uppercase, lowercase, or mixed-case names", () => {
      expect(cleanCustomerName("ALICE SMITH")).toBe("Alice");
      expect(cleanCustomerName("rohit sharma")).toBe("Rohit");
      expect(cleanCustomerName("pRiYa nAiR")).toBe("Priya");
    });

    it("returns empty string if all tokens in the string were honorifics or initials", () => {
      expect(cleanCustomerName("Dr. N. K.")).toBe("");
      expect(cleanCustomerName("Mr. K. R.")).toBe("");
    });
  });
});
