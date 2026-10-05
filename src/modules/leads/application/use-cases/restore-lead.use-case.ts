import type { LeadRepository } from "../interfaces/lead-repository.interface";
import {
  LeadNotFoundError,
  LeadNotDeletedError,
} from "../../domain/errors/lead.errors";

export class RestoreLeadUseCase {
  constructor(private readonly leadRepo: LeadRepository) {}

  async execute(tenantId: string, leadId: string): Promise<void> {
    // Explicitly target deleted dataset segment
    const lead = await this.leadRepo.findById(tenantId, leadId);
    if (!lead) throw new LeadNotFoundError();
    if (!lead.isDeleted) throw new LeadNotDeletedError();
    await this.leadRepo.restore(leadId);
  }
}
