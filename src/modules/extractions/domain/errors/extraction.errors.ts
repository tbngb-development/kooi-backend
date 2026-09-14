import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class ExtractionCategoryNotFoundError extends AppError {
  constructor(identifier: string) {
    super(
      HttpStatus.NOT_FOUND,
      `Extraction category '${identifier}' not found`,
      "EXTRACTION_CATEGORY_NOT_FOUND",
    );
  }
}

export class ExtractionDispositionNotFoundError extends AppError {
  constructor(identifier: string) {
    super(
      HttpStatus.NOT_FOUND,
      `Extraction disposition '${identifier}' not found`,
      "EXTRACTION_DISPOSITION_NOT_FOUND",
    );
  }
}

export class DuplicateExtractionSlugError extends AppError {
  constructor(slug: string) {
    super(
      HttpStatus.CONFLICT,
      `Extraction slug '${slug}' already exists`,
      "DUPLICATE_EXTRACTION_SLUG",
    );
  }
}

export class ExtractionCategoryHasDispositionsError extends AppError {
  constructor(count: number) {
    super(
      HttpStatus.CONFLICT,
      `Cannot delete category: ${count} disposition(s) still linked`,
      "EXTRACTION_CATEGORY_NOT_EMPTY",
    );
  }
}

export class ExtractionSyncError extends AppError {
  constructor(reason: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      `Extraction sync failed: ${reason}`,
      "EXTRACTION_SYNC_FAILED",
    );
  }
}

export class ExtractionPlatformAgentRequiredError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "A linked Platform Agent is required for Bolna sync",
      "EXTRACTION_AGENT_REQUIRED",
    );
  }
}
