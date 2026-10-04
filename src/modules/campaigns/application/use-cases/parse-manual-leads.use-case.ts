import type { ParseLeadsUseCase } from "./parse-leads.use-case";
import type { ParseLeadsOutput } from "../dto/campaign.dto";
import { serializeManualLeadsToCSV } from "../../../batches/infrastructure/manual-leads-csv-serializer";

export interface ParseManualLeadsInput {
  tenantId: string;
  campaignId: string;
  leads: Array<{
    contact_number: string;
    customer_name?: string;
  }>;
}

/**
 * Adapter that serializes manual JSON leads into a CSV buffer and delegates
 * to the robust ParseLeadsUseCase. Reuses phone validation, DB deduplication, 
 * plan limits, and call cost/wallet estimations.
 */
export class ParseManualLeadsUseCase {
  constructor(private readonly parseLeadsUseCase: ParseLeadsUseCase) {}

  async execute(input: ParseManualLeadsInput): Promise<ParseLeadsOutput> {
    const csvBuffer = serializeManualLeadsToCSV(input.leads);
    const fileName = "manual-preview.csv";

    return this.parseLeadsUseCase.execute({
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      fileBuffer: csvBuffer,
      fileName,
    });
  }
}