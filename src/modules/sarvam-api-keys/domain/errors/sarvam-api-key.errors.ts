import { AppError } from "../../../../shared/errors/app.error";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class SarvamApiKeyNotFoundError extends NotFoundError {
  constructor(idOrTenantId?: string) {
    super(
      idOrTenantId
        ? `Sarvam API key for '${idOrTenantId}'`
        : "Sarvam API key",
    );
  }
}

export class SarvamApiKeyConflictError extends ConflictError {
  constructor(tenantId: string) {
    super(
      `Sarvam API key configuration already exists for tenant: ${tenantId}. Multiple key profiles per tenant are not permitted.`,
    );
  }
}

export class TenantNotFoundError extends NotFoundError {
  constructor(tenantId: string) {
    super(`Tenant with id '${tenantId}'`);
  }
}

export class SarvamApiKeyInactiveError extends AppError {
  constructor(tenantId: string) {
    super(
      HttpStatus.FORBIDDEN,
      `Sarvam API key for tenant '${tenantId}' is inactive.`,
      "SARVAM_API_KEY_INACTIVE",
    );
  }
}

export class SarvamApiKeyEncryptionError extends AppError {
  constructor(message: string = "Failed to process encrypted credentials.") {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      "SARVAM_KEY_ENCRYPTION_ERROR",
    );
  }
}

