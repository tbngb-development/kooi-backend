// modules/calls/application/use-cases/export-calls.use-case.ts

import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import type { ListCallsInput } from "../dto/call.dto";
import type {
  CallRepository,
  ListCallsFilters,
} from "../interfaces/call-repository.interface";
import {
  dedupeLatestCallPerPhone,
  serializeCallsToCsv,
} from "../utils/call-export-csv";

export const MAX_EXPORT_ROWS = 50000;
export const DEFAULT_EXPORT_TIMEZONE = "Asia/Kolkata";

export type ExportCallsInput = Omit<ListCallsInput, "page" | "limit"> & {
  timezone?: string;
};

export class ExportCallsUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(input: ExportCallsInput): Promise<string> {
    const filters: ListCallsFilters = {
      provider: input.provider,
      campaignId: input.campaignId,
      batchId: input.batchId,
      agentId: input.agentId,
      leadId: input.leadId,
      status: input.status,
      type: input.type,
      source: input.source,
      agentNumber: input.agentNumber,
      search: input.search,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      dynamicFilters: input.dynamicFilters,
      isDeleted: input.isDeleted,
      goalId: input.goalId,
      goalPassed: input.goalPassed,
    };

    // Fetch one extra row so an oversized export can be rejected without
    // loading the entire result set into memory.
    const calls = await this.callRepo.findAllForExport(
      input.tenantId,
      filters,
      MAX_EXPORT_ROWS + 1,
    );

    if (calls.length > MAX_EXPORT_ROWS) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        `Too many calls match these filters. Narrow your filters and export again (limit ${MAX_EXPORT_ROWS.toLocaleString("en-US")} rows).`,
        "CALL_EXPORT_TOO_LARGE",
      );
    }

    return serializeCallsToCsv(
      dedupeLatestCallPerPhone(calls),
      input.timezone || DEFAULT_EXPORT_TIMEZONE,
    );
  }
}
