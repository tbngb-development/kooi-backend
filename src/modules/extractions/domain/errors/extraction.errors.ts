import { AppError } from "../../../../shared/errors/app.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

// ── Not Found ────────────────────────────────────────────────────────────────

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

// ── Duplicate / Conflict ─────────────────────────────────────────────────────

export class DuplicateExtractionCategoryNameError extends AppError {
  constructor(name: string) {
    super(
      HttpStatus.CONFLICT,
      `An extraction category with name '${name}' already exists (case-insensitive)`,
      "DUPLICATE_EXTRACTION_CATEGORY_NAME",
    );
  }
}

export class DuplicateExtractionCategorySlugError extends AppError {
  constructor(slug: string) {
    super(
      HttpStatus.CONFLICT,
      `An extraction category with slug '${slug}' already exists`,
      "DUPLICATE_EXTRACTION_CATEGORY_SLUG",
    );
  }
}

export class DuplicateExtractionDispositionNameError extends AppError {
  constructor(name: string) {
    super(
      HttpStatus.CONFLICT,
      `An extraction disposition with name '${name}' already exists (case-insensitive)`,
      "DUPLICATE_EXTRACTION_DISPOSITION_NAME",
    );
  }
}

export class DuplicateExtractionDispositionSlugError extends AppError {
  constructor(slug: string) {
    super(
      HttpStatus.CONFLICT,
      `An extraction disposition with slug '${slug}' already exists`,
      "DUPLICATE_EXTRACTION_DISPOSITION_SLUG",
    );
  }
}

// ── Deletion Guards ──────────────────────────────────────────────────────────

export class ExtractionCategoryAttachedToAgentError extends AppError {
  constructor(categoryId: string) {
    super(
      HttpStatus.CONFLICT,
      `Cannot delete extraction category '${categoryId}' because it is assigned to one or more platform agents. Remove the assignment first.`,
      "EXTRACTION_CATEGORY_ATTACHED_TO_AGENT",
    );
  }
}

export class ExtractionDispositionAttachedToAgentError extends AppError {
  constructor(dispositionId: string) {
    super(
      HttpStatus.CONFLICT,
      `Cannot delete extraction disposition '${dispositionId}' because it is assigned to one or more platform agents. Remove the assignment first.`,
      "EXTRACTION_DISPOSITION_ATTACHED_TO_AGENT",
    );
  }
}

// ── Sync & Operational Errors ────────────────────────────────────────────────

export class ExtractionPlatformAgentRequiredError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "A valid platform agent with a Bolna ID is required.",
      "EXTRACTION_PLATFORM_AGENT_REQUIRED",
    );
  }
}

export class ExtractionSyncError extends AppError {
  constructor(reason: string) {
    super(
      HttpStatus.BAD_GATEWAY,
      `Failed to sync extraction with Bolna: ${reason}`,
      "EXTRACTION_SYNC_FAILED",
    );
  }
}
