import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";
import type { BatchStatus } from "@prisma/client";

export class BatchNotFoundError extends NotFoundError {
  constructor() {
    super("Batch");
  }
}

export class BatchOperationError extends AppError {
  constructor(message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, message, "BATCH_OPERATION_ERROR");
  }
}

export class BatchNoBolnaIdError extends AppError {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Batch has no Bolna batch ID. It may not have been dispatched.",
      "BATCH_NO_BOLNA_ID",
    );
  }
}

export class BatchNoPendingLeadsError extends AppError {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "No remaining PENDING leads to resume in this batch",
      "BATCH_NO_PENDING_LEADS",
    );
  }
}

export class BatchActiveDeleteError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "Cannot delete an active batch. Stop it first.",
      "BATCH_ACTIVE_DELETE",
    );
  }
}

export class InvalidBatchStatusTransitionError extends AppError {
  constructor(from: BatchStatus, to: BatchStatus) {
    super(
      HttpStatus.CONFLICT,
      `Invalid batch status transition: ${from} → ${to}`,
      "INVALID_STATUS_TRANSITION",
    );
  }
}

export class EmptyFileError extends AppError {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Uploaded file is empty — no rows found",
      "EMPTY_FILE",
    );
  }
}

export class NoValidIndianPhonesError extends AppError {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "No valid Indian phone numbers found in the uploaded file",
      "NO_VALID_PHONES",
    );
  }
}

export class AllLeadsDuplicateError extends AppError {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "All leads in this file already exist in the campaign (cross-batch dedup)",
      "ALL_LEADS_DUPLICATE",
    );
  }
}

export class BolnaBatchCreationError extends AppError {
  constructor(detail: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      `Bolna batch creation failed. Leads saved locally. ${detail}`,
      "BOLNA_BATCH_CREATION_FAILED",
    );
  }
}

export class MaxLeadsPerBatchExceededError extends AppError {
  constructor(maxAllowed: number, actual: number) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      `The file contains ${actual} ready-to-import leads, which exceeds your plan limit of ${maxAllowed} leads per batch.`,
      "MAX_LEADS_PER_BATCH_EXCEEDED",
    );
  }
}
