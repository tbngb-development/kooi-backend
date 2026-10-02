import { PrismaLeadRepository } from "./infrastructure/repositories/prisma-lead.repository";
import { ListLeadsUseCase } from "./application/use-cases/list-leads.use-case";
import { GetLeadUseCase } from "./application/use-cases/get-lead.use-case";
import { GetLeadStatsUseCase } from "./application/use-cases/get-lead-stats.use-case";
import { TenantLeadController } from "./presentation/tenant-lead.controller";
import { AdminLeadController } from "./presentation/admin-lead.controller";

export interface LeadModule {
  tenantController: TenantLeadController;
  adminController: AdminLeadController;
}

export function buildLeadModule(): LeadModule {
  const repo = new PrismaLeadRepository();
  const listLeads = new ListLeadsUseCase(repo);
  const getLead = new GetLeadUseCase(repo);
  const getLeadStats = new GetLeadStatsUseCase(repo);

  return {
    tenantController: new TenantLeadController(
      listLeads,
      getLead,
      getLeadStats,
    ),
    adminController: new AdminLeadController(listLeads, getLead, getLeadStats),
  };
}
