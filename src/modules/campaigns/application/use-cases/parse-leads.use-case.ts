import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../../batches/application/interfaces/batch-repository.interface";
import type { ParseLeadsInput, ParseLeadsOutput } from "../dto/campaign.dto";
import {
  CampaignNotFoundError,
  CampaignFailedError,
} from "../../domain/errors/campaign.errors";
import {
  parseLeadBuffer,
  isIndianPhone,
  type LeadRow,
} from "../../../leads/infrastructure/leadParser";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { env } from "../../../../shared/config/env";

export class ParseLeadsUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly batchRepo: BatchRepository,
  ) {}

  async execute(input: ParseLeadsInput): Promise<ParseLeadsOutput> {
    const campaign = await this.campaignRepo.findById(
      input.tenantId,
      input.campaignId,
    );

    if (!campaign) throw new CampaignNotFoundError();
    if (campaign.status === "FAILED")
      throw new CampaignFailedError("parse leads for");

    // parseLeadBuffer now validates headers and throws
    // MissingRequiredHeaderError (400) if contact_number is absent.
    const { rows, headerInfo } = parseLeadBuffer(
      input.fileBuffer,
      input.fileName,
    );

    if (rows.length === 0) {
      return {
        total: 0,
        valid: 0,
        invalid: 0,
        nonIndian: 0,
        nonIndianNumbers: [],
        inFileDuplicates: 0,
        inFileDuplicateNumbers: [],
        dbDuplicates: 0,
        dbDuplicateNumbers: [],
        readyToImport: 0,
        detectedHeaders: {
          contact_number: headerInfo.hasContactNumber,
          customer_name: headerInfo.hasCustomerName,
        },
      };
    }

    const rowsWithPhone = rows.filter((r) => r.phone && r.phone.trim() !== "");
    const missingPhoneCount = rows.length - rowsWithPhone.length;

    const indianRows = rowsWithPhone
      .filter((r) => isIndianPhone(r.phone))
      .map((r) => ({ ...r, phone: normalizePhoneNumber(r.phone) }));

    const nonIndianNumbers = rowsWithPhone
      .filter((r) => !isIndianPhone(r.phone))
      .map((r) => r.phone);

    // In-file dedup
    const seenInFile = new Set<string>();
    const inFileDuplicateNumbers: string[] = [];
    const uniqueRows: LeadRow[] = [];

    for (const row of indianRows) {
      if (seenInFile.has(row.phone)) {
        inFileDuplicateNumbers.push(row.phone);
      } else {
        seenInFile.add(row.phone);
        uniqueRows.push(row);
      }
    }

    // Cross-batch dedup
    const dbDuplicateNumbers: string[] = [];
    let newLeads: LeadRow[] = [];

    if (env.skipCrossBatchDedup) {
      newLeads = uniqueRows;
    } else {
      const uniquePhones = uniqueRows.map((r) => r.phone);
      const existingPhones = await this.batchRepo.findExistingPhones(
        input.campaignId,
        uniquePhones,
      );

      for (const row of uniqueRows) {
        if (existingPhones.has(row.phone)) {
          dbDuplicateNumbers.push(row.phone);
        } else {
          newLeads.push(row);
        }
      }
    }

    return {
      total: rows.length,
      valid: indianRows.length,
      invalid: missingPhoneCount,
      nonIndian: nonIndianNumbers.length,
      nonIndianNumbers,
      inFileDuplicates: inFileDuplicateNumbers.length,
      inFileDuplicateNumbers,
      dbDuplicates: dbDuplicateNumbers.length,
      dbDuplicateNumbers,
      readyToImport: newLeads.length,
      detectedHeaders: {
        contact_number: headerInfo.hasContactNumber,
        customer_name: headerInfo.hasCustomerName,
      },
    };
  }
}
