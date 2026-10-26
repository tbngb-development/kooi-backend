import { type LeadRepository } from "../interfaces/lead-repository.interface";
import { LeadNotFoundError } from "../../domain/errors/lead.errors";

export interface ToggleLeadDncInput {
  tenantId: string;
  leadId: string;
  doNotCall: boolean;
  reason: string;
  adminUserId: string;
}

export class ToggleLeadDncUseCase {
  constructor(private readonly leadRepo: LeadRepository) {}

  async execute(input: ToggleLeadDncInput) {
    if (!input.reason || input.reason.trim().length < 3) {
      throw new Error("DNC reason must be at least 3 characters");
    }

    const lead = await this.leadRepo.findById(input.tenantId, input.leadId);
    if (!lead) {
      throw new LeadNotFoundError();
    }

    return this.leadRepo.updateDnc(input.tenantId, input.leadId, {
      doNotCall: input.doNotCall,
      reason: input.reason.trim(),
      adminUserId: input.adminUserId,
    });
  }
}
