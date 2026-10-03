// modules/leads/application/use-cases/archive-lead.use-case.ts

import type { LeadRepository } from "../interfaces/lead-repository.interface";
import { LeadNotFoundError, LeadAlreadyDeletedError } from "../../domain/errors/lead.errors";

export class ArchiveLeadUseCase {
  constructor(private readonly leadRepo: LeadRepository) {}

  async execute(tenantId: string, leadId: string): Promise<void> {
    const lead = await this.leadRepo.findById(tenantId, leadId);
    if (!lead) throw new LeadNotFoundError();
    if (lead.isDeleted) throw new LeadAlreadyDeletedError();
    await this.leadRepo.softDelete(leadId);
  }
}