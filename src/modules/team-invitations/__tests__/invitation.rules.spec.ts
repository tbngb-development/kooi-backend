import { describe, it, expect } from "vitest";
import {
  getInviteInvalidReason,
  isPendingInvite,
  maskEmail,
  normalizeInviteEmail,
} from "../domain/rules/invitation.rules";

const NOW = new Date("2026-01-10T00:00:00.000Z");

describe("invitation rules", () => {
  describe("normalizeInviteEmail", () => {
    it("trims and lowercases an email", () => {
      expect(normalizeInviteEmail("  Alice@Example.COM  ")).toBe(
        "alice@example.com",
      );
    });
  });

  describe("maskEmail", () => {
    it("reveals only the first local-part character and the domain", () => {
      expect(maskEmail("alice@example.com")).toBe("a***@example.com");
      expect(maskEmail("b@sub.example.co.uk")).toBe("b***@sub.example.co.uk");
    });

    it("normalizes before masking", () => {
      expect(maskEmail("  ALICE@Example.com ")).toBe("a***@example.com");
    });

    it("does not throw on a malformed address", () => {
      expect(() => maskEmail("no-at-sign")).not.toThrow();
      expect(maskEmail("no-at-sign")).toBe("***");
    });
  });

  describe("getInviteInvalidReason", () => {
    it("returns null for a pending, unexpired invite", () => {
      expect(
        getInviteInvalidReason("PENDING", new Date(NOW.getTime() + 1000), NOW),
      ).toBeNull();
    });

    it("returns EXPIRED for a pending invite expired at exactly now", () => {
      expect(getInviteInvalidReason("PENDING", NOW, NOW)).toBe("EXPIRED");
    });

    it("returns EXPIRED for an already flipped EXPIRED invite", () => {
      expect(
        getInviteInvalidReason("EXPIRED", new Date(NOW.getTime() + 1000), NOW),
      ).toBe("EXPIRED");
    });

    it("returns INVALID for a revoked or accepted invite", () => {
      const future = new Date(NOW.getTime() + 1000);

      expect(getInviteInvalidReason("REVOKED", future, NOW)).toBe("INVALID");
      expect(getInviteInvalidReason("ACCEPTED", future, NOW)).toBe("INVALID");
    });

    it("does not report INVALID invites as expired", () => {
      expect(getInviteInvalidReason("REVOKED", NOW, NOW)).toBe("INVALID");
    });
  });

  describe("isPendingInvite", () => {
    it("is true only for a pending, unexpired invite", () => {
      const future = new Date(NOW.getTime() + 1000);

      expect(isPendingInvite("PENDING", future, NOW)).toBe(true);
      expect(isPendingInvite("PENDING", NOW, NOW)).toBe(false);
      expect(isPendingInvite("REVOKED", future, NOW)).toBe(false);
      expect(isPendingInvite("ACCEPTED", future, NOW)).toBe(false);
      expect(isPendingInvite("EXPIRED", future, NOW)).toBe(false);
    });
  });
});
