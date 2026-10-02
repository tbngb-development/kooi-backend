import prisma from "../../../../shared/config/database/prisma";
import type { TenantEmailRepository } from "../../application/interfaces/tenant-email-repository.interface";

export class PrismaTenantEmailRepository implements TenantEmailRepository {
  async getEmailById(tenantId: string): Promise<string | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { email: true },
    });
    return tenant?.email ?? null;
  }
}
