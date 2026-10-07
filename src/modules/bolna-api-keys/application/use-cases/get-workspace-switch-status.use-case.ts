import prisma from "../../../../shared/config/database/prisma";

export class GetWorkspaceSwitchStatusUseCase {
  async execute(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        workspaceSwitchStatus: true,
        workspaceSwitchError: true,
        workspaceSwitchJobId: true,
        bolnaApiKey: {
          select: { id: true, keyIdentifier: true, type: true },
        },
      },
    });

    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: tenant.workspaceSwitchStatus,
      error: tenant.workspaceSwitchError,
      jobId: tenant.workspaceSwitchJobId,
      activeKey: tenant.bolnaApiKey,
    };
  }
}