import { describe, it, expect } from "vitest";
import {
  canAcceptInvite,
  canAddInvite,
  getSeatAvailability,
} from "../domain/rules/seat.rules";

describe("team invitation seat rules", () => {
  describe("getSeatAvailability", () => {
    it("reports null limit and null available for an unlimited plan", () => {
      expect(getSeatAvailability(3, 2, null)).toEqual({
        used: 3,
        pending: 2,
        limit: null,
        available: null,
      });
    });

    it("reports remaining seats when under the limit", () => {
      expect(getSeatAvailability(2, 1, 5)).toEqual({
        used: 2,
        pending: 1,
        limit: 5,
        available: 2,
      });
    });

    it("clamps to zero when at the limit", () => {
      expect(getSeatAvailability(4, 1, 5)).toEqual({
        used: 4,
        pending: 1,
        limit: 5,
        available: 0,
      });
    });

    it("clamps to zero when over the limit after a downgrade", () => {
      expect(getSeatAvailability(6, 1, 5)).toEqual({
        used: 6,
        pending: 1,
        limit: 5,
        available: 0,
      });
    });
  });

  describe("canAddInvite (invite time counts members + pending invites)", () => {
    it("allows any number of invites on an unlimited plan", () => {
      expect(canAddInvite(100, 50, null)).toBe(true);
    });

    it("allows an invite when below the limit", () => {
      expect(canAddInvite(2, 1, 5)).toBe(true);
    });

    it("blocks an invite when at the limit", () => {
      expect(canAddInvite(4, 1, 5)).toBe(false);
    });

    it("blocks an invite when over the limit", () => {
      expect(canAddInvite(6, 1, 5)).toBe(false);
    });
  });

  describe("canAcceptInvite (accept time counts only active members)", () => {
    it("allows acceptance on an unlimited plan", () => {
      expect(canAcceptInvite(100, null)).toBe(true);
    });

    it("allows acceptance when below the limit", () => {
      expect(canAcceptInvite(4, 5)).toBe(true);
    });

    it("blocks acceptance when at the limit without double counting the pending invite", () => {
      expect(canAcceptInvite(5, 5)).toBe(false);
    });

    it("blocks acceptance when over the limit", () => {
      expect(canAcceptInvite(6, 5)).toBe(false);
    });
  });
});
