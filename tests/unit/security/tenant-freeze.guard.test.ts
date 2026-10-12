import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertTenantNotFrozen } from "../../../src/shared/utils/tenant-freeze.guard";
import prisma from "../../../src/shared/config/database/prisma";
import { TenantWorkspaceFrozenError } from "../../../src/shared/errors/frozen.error";
import { TenantKeyDeactivatedError } from "../../../src/shared/errors/key-deactivated.error";

vi.mock("../../../src/shared/config/database/prisma", () => ({
  default: {
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

describe("TenantFreezeGuard (Module 3 - Migration & API Key Safety Boundary)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes silently when tenant is normal and not being migrated", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      workspaceSwitchStatus: null,
      bolnaApiKey: { isActive: true },
    } as any);

    await expect(assertTenantNotFrozen("tenant-123")).resolves.toBeUndefined();
  });

  it("passes silently when tenant record is not found", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

    await expect(assertTenantNotFrozen("non-existent-id")).resolves.toBeUndefined();
  });

  it("throws TenantWorkspaceFrozenError (423 Locked) when workspace is being cloned", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      workspaceSwitchStatus: "CLONING",
      bolnaApiKey: { isActive: true },
    } as any);

    await expect(assertTenantNotFrozen("tenant-frozen-id")).rejects.toThrow(
      TenantWorkspaceFrozenError,
    );

    try {
      await assertTenantNotFrozen("tenant-frozen-id");
    } catch (err: any) {
      expect(err.statusCode).toBe(423);
      expect(err.code).toBe("TENANT_WORKSPACE_FROZEN");
    }
  });

  it("throws TenantKeyDeactivatedError (423 Locked) when assigned Bolna key is deactivated", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      workspaceSwitchStatus: null,
      bolnaApiKey: { isActive: false },
    } as any);

    await expect(assertTenantNotFrozen("tenant-deactivated-key")).rejects.toThrow(
      TenantKeyDeactivatedError,
    );

    try {
      await assertTenantNotFrozen("tenant-deactivated-key");
    } catch (err: any) {
      expect(err.statusCode).toBe(423);
      expect(err.code).toBe("TENANT_KEY_DEACTIVATED");
    }
  });
});
