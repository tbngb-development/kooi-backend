import { type LeadRepository } from "../interfaces/lead-repository.interface";
import { LeadNotFoundError } from "../../domain/errors/lead.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface RevealLeadPiiInput {
  tenantId: string;
  leadId: string;
  adminUserId: string;
  adminEmail?: string;
  reason?: string;
}

export interface RevealLeadPiiOutput {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  revealedAt: string;
}

export class RevealLeadPiiUseCase {
  constructor(
    private readonly leadRepo: LeadRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: RevealLeadPiiInput): Promise<RevealLeadPiiOutput> {
    const lead = await this.leadRepo.findById(input.tenantId, input.leadId);
    if (!lead) {
      throw new LeadNotFoundError();
    }

    this.logger.warn("[Audit] Platform Administrator accessed Lead PII", {
      action: "LEAD_PII_REVEAL",
      tenantId: input.tenantId,
      leadId: input.leadId,
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      reason: input.reason ?? "Administrative inspection",
      timestamp: new Date().toISOString(),
    });

    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      revealedAt: new Date().toISOString(),
    };
  }
}
