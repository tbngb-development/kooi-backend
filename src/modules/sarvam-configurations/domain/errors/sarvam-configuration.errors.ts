import { AppError } from "../../../../shared/errors/app.error";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { ConflictError } from "../../../../shared/errors/conflict.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class SarvamConfigurationNotFoundError extends NotFoundError {
  constructor(idOrTenantId?: string) {
    super(
      idOrTenantId
        ? `Sarvam configuration for '${idOrTenantId}'`
        : "Sarvam configuration",
    );
  }
}

export class SarvamConfigurationConflictError extends ConflictError {
  constructor(tenantId: string) {
    super(
      `Sarvam configuration already exists for tenant: ${tenantId}. Multiple configurations per tenant are not permitted.`,
    );
  }
}

export class TenantNotFoundError extends NotFoundError {
  constructor(tenantId: string) {
    super(`Tenant with id '${tenantId}'`);
  }
}

export class SarvamConfigurationInactiveError extends AppError {
  constructor(tenantId: string) {
    super(
      HttpStatus.FORBIDDEN,
      `Sarvam configuration for tenant '${tenantId}' is inactive.`,
      "SARVAM_CONFIGURATION_INACTIVE",
    );
  }
}

export class SarvamEncryptionError extends AppError {
  constructor(message: string = "Failed to process encrypted credentials.") {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      "SARVAM_ENCRYPTION_ERROR",
    );
  }
}

