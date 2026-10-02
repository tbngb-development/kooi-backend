import {
  type LeadRepository,
  type DetailedLeadResult,
} from "../interfaces/lead-repository.interface";
import { LeadNotFoundError } from "../../domain/errors/lead.errors";

export class GetLeadUseCase {
  constructor(private readonly leadRepo: LeadRepository) {}

  async execute(tenantId: string, id: string): Promise<DetailedLeadResult> {
    const lead = await this.leadRepo.findById(tenantId, id);
    if (!lead) {
      throw new LeadNotFoundError();
    }
    return lead;
  }
}
