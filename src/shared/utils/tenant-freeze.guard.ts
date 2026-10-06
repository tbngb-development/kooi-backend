import prisma from "../config/database/prisma";
import { TenantWorkspaceFrozenError } from "../errors/frozen.error";

/**
 * Asserts that the given tenant is NOT in a workspace-migration freeze.
 *
 * Call this at the top of every mutation use case that touches Bolna:
 *   - CreateCampaignUseCase
 *   - CreateBatchUseCase
 *   - RunBatchUseCase
 *   - ScheduleBatchUseCase
 *   - ResumeBatchUseCase
 *   - BatchProcessingWorker
 *   - BolnaCallProviderImpl.createCall
 *   - InboundCallerMatchUseCase
 *
 * Reads (list, get, stats) do NOT need this guard.
 */
export async function assertTenantNotFrozen(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { workspaceSwitchStatus: true },
  });

  if (tenant?.workspaceSwitchStatus === "CLONING") {
    throw new TenantWorkspaceFrozenError(tenantId);
  }
}
