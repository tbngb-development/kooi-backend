import { describe, it, expect } from "vitest";
import { canInviteRole, invitableRoles } from "../domain/rules/role.rules";

describe("team invitation role rules", () => {
  describe("OWNER actor", () => {
    it("may grant OWNER", () => {
      expect(canInviteRole("OWNER", "OWNER")).toBe(true);
    });

    it("may grant ADMIN", () => {
      expect(canInviteRole("OWNER", "ADMIN")).toBe(true);
    });

    it("may grant USER", () => {
      expect(canInviteRole("OWNER", "USER")).toBe(true);
    });
  });

  describe("ADMIN actor", () => {
    it("may grant USER", () => {
      expect(canInviteRole("ADMIN", "USER")).toBe(true);
    });

    it("may not grant ADMIN", () => {
      expect(canInviteRole("ADMIN", "ADMIN")).toBe(false);
    });

    it("may not grant OWNER", () => {
      expect(canInviteRole("ADMIN", "OWNER")).toBe(false);
    });
  });

  describe("USER actor", () => {
    it("may not grant any role", () => {
      expect(canInviteRole("USER", "OWNER")).toBe(false);
      expect(canInviteRole("USER", "ADMIN")).toBe(false);
      expect(canInviteRole("USER", "USER")).toBe(false);
    });
  });

  describe("invitableRoles", () => {
    it("returns the full role set for OWNER", () => {
      expect(invitableRoles("OWNER")).toEqual(["OWNER", "ADMIN", "USER"]);
    });

    it("returns only USER for ADMIN", () => {
      expect(invitableRoles("ADMIN")).toEqual(["USER"]);
    });

    it("returns an empty list for USER", () => {
      expect(invitableRoles("USER")).toEqual([]);
    });
  });
});
