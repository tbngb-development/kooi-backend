import prisma from "../../../../shared/config/database/prisma";
import type { TenantNameRepository } from "../../application/interfaces/tenant-name-repository.interface";

export class PrismaTenantNameRepository implements TenantNameRepository {
  async getNameById(tenantId: string): Promise<string | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name ?? null;
  }
}
