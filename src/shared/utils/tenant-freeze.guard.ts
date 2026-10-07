import prisma from "../config/database/prisma";
import { TenantWorkspaceFrozenError } from "../errors/frozen.error";
import { TenantKeyDeactivatedError } from "../errors/key-deactivated.error";

/**
 * Asserts that the given tenant is allowed to perform mutations.
 *
 * Blocks if:
 *   1. Tenant workspace is being migrated (workspaceSwitchStatus = CLONING)
 *   2. Tenant's assigned Bolna API key has been deactivated (isActive = false)
 *
 * Call this at the top of every mutation use case that touches Bolna.
 * Reads (list, get, stats) do NOT need this guard.
 */
export async function assertTenantNotFrozen(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      workspaceSwitchStatus: true,
      bolnaApiKey: {
        select: { isActive: true },
      },
    },
  });

  if (!tenant) return;

  if (tenant.workspaceSwitchStatus === "CLONING") {
    throw new TenantWorkspaceFrozenError(tenantId);
  }

  if (tenant.bolnaApiKey && !tenant.bolnaApiKey.isActive) {
    throw new TenantKeyDeactivatedError();
  }
}
