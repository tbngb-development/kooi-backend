import { describe, it, expect } from "vitest";
import { JwtTokenService } from "../../../../src/modules/auth/infrastructure/services/jwt-token.service";
import { UnauthorizedError } from "../../../../src/shared/errors/unauthorized.error";

describe("JwtTokenService (Module 2)", () => {
  const tokenService = new JwtTokenService();

  describe("Access Tokens", () => {
    it("generates and verifies tenant-scoped access token", () => {
      const context = {
        userId: "user-uuid-1",
        membershipId: "membership-uuid-1",
        tenantId: "tenant-uuid-1",
        tenantRole: "OWNER" as const,
        isPlatformAdmin: false,
      };

      const token = tokenService.generateAccessToken(context);
      expect(typeof token).toBe("string");

      const payload = tokenService.verifyAccessToken(token);
      expect(payload.userId).toBe(context.userId);
      expect(payload.tenantId).toBe(context.tenantId);
      expect(payload.membershipId).toBe(context.membershipId);
      expect(payload.tenantRole).toBe("OWNER");
      expect(payload.type).toBe("tenant");
      expect(payload.isPlatformAdmin).toBe(false);
    });

    it("generates and verifies base access token for multi-tenant users", () => {
      const userId = "user-uuid-2";
      const token = tokenService.generateBaseAccessToken(userId, false);

      const payload = tokenService.verifyAccessToken(token);
      expect(payload.userId).toBe(userId);
      expect(payload.tenantId).toBeNull();
      expect(payload.membershipId).toBeNull();
      expect(payload.type).toBe("base");
    });

    it("generates and verifies platform admin access token", () => {
      const userId = "admin-uuid-1";
      const token = tokenService.generateAdminAccessToken(userId);

      const payload = tokenService.verifyAccessToken(token);
      expect(payload.userId).toBe(userId);
      expect(payload.isPlatformAdmin).toBe(true);
      expect(payload.type).toBe("admin");
    });

    it("throws UnauthorizedError on tampered access token", () => {
      const token = tokenService.generateBaseAccessToken("user-1", false);
      const tampered = token.slice(0, -5) + "abcde";

      expect(() => tokenService.verifyAccessToken(tampered)).toThrow(
        UnauthorizedError,
      );
    });
  });

  describe("Refresh Tokens & Token Families", () => {
    it("generates refresh token with SHA-256 hash and UUID family ID", () => {
      const userId = "user-uuid-3";
      const result = tokenService.generateRefreshToken(userId);

      expect(result.rawToken).toBeDefined();
      expect(result.tokenHash).toHaveLength(64); // SHA-256 hex string
      expect(result.familyId).toBeDefined();
      expect(result.expiresIn).toBeGreaterThan(0);

      const verified = tokenService.verifyRefreshToken(result.rawToken);
      expect(verified.userId).toBe(userId);
      expect(verified.tokenId).toBe(result.tokenHash);
      expect(verified.type).toBe("refresh");
    });

    it("generates child refresh token inheriting the same familyId", () => {
      const userId = "user-uuid-4";
      const parent = tokenService.generateRefreshToken(userId);

      const child = tokenService.generateRefreshTokenForFamily(
        userId,
        parent.familyId,
      );

      expect(child.familyId).toBe(parent.familyId);
      expect(child.tokenHash).not.toBe(parent.tokenHash);
      expect(child.rawToken).not.toBe(parent.rawToken);

      const verified = tokenService.verifyRefreshToken(child.rawToken);
      expect(verified.userId).toBe(userId);
      expect(verified.tokenId).toBe(child.tokenHash);
    });
  });

  describe("Invite Tokens", () => {
    it("generates and verifies tenant invite token", () => {
      const inviteData = {
        tenantId: "tenant-uuid-1",
        role: "ADMIN" as const,
        email: "invited@company.com",
        inviterId: "inviter-uuid-1",
      };

      const token = tokenService.generateInviteToken(
        inviteData.tenantId,
        inviteData.role,
        inviteData.email,
        inviteData.inviterId,
      );

      const payload = tokenService.verifyInviteToken(token);
      expect(payload.tenantId).toBe(inviteData.tenantId);
      expect(payload.role).toBe("ADMIN");
      expect(payload.email).toBe(inviteData.email);
      expect(payload.inviterId).toBe(inviteData.inviterId);
      expect(payload.type).toBe("invite");
    });
  });
});
