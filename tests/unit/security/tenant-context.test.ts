import { describe, it, expect } from "vitest";
import { getTenantContext } from "../../../src/shared/utils/tenant-context";
import { UnauthorizedError } from "../../../src/shared/errors/unauthorized.error";
import { ForbiddenError } from "../../../src/shared/errors/forbidden.error";

describe("TenantContext Utility (Module 3 - Context Extraction)", () => {
  it("extracts and returns TenantAuthContext from an authorized request", () => {
    const mockTenantContext = {
      type: "tenant" as const,
      userId: "usr-123",
      email: "owner@kooi.io",
      membershipId: "mem-456",
      tenantId: "tnt-789",
      tenantRole: "OWNER" as const,
      isPlatformAdmin: false,
    };

    const req = { user: mockTenantContext };
    const result = getTenantContext(req);

    expect(result).toEqual(mockTenantContext);
    expect(result.tenantId).toBe("tnt-789");
  });

  it("throws UnauthorizedError when user is not present on request", () => {
    const req = {};
    expect(() => getTenantContext(req)).toThrow(UnauthorizedError);
  });

  it("throws ForbiddenError when user context type is not 'tenant' (e.g. admin or base)", () => {
    const adminReq = {
      user: {
        type: "admin",
        userId: "admin-1",
        email: "admin@platform.io",
        isPlatformAdmin: true,
      },
    };

    expect(() => getTenantContext(adminReq)).toThrow(ForbiddenError);

    const baseReq = {
      user: {
        type: "base",
        userId: "base-1",
        email: "base@user.io",
        isPlatformAdmin: false,
      },
    };

    expect(() => getTenantContext(baseReq)).toThrow(ForbiddenError);
  });
});
