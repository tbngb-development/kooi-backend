import { AppError } from "../../../../shared/errors/app.error";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import { HttpStatus } from "../../../../shared/constants/http-status";

export class BolnaApiKeyNotFoundError extends NotFoundError {
  constructor(id?: string) {
    super(id ? `Bolna API key ${id}` : "Bolna API key");
  }
}

export class NoAvailableApiKeyError extends AppError {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      "No active GENERAL Bolna API keys available in the pool.",
      "NO_AVAILABLE_API_KEY",
    );
  }
}

/** Tenant has no key assigned — configuration problem, treat as 400 */
export class TenantHasNoApiKeyError extends AppError {
  constructor(tenantId: string) {
    super(
      HttpStatus.BAD_REQUEST,
      `No Bolna API key assigned to tenant: ${tenantId}`,
      "TENANT_HAS_NO_API_KEY",
    );
  }
}

export class CannotReassignCustomKeyError extends AppError {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      "CUSTOM API keys cannot be reassigned to other tenants.",
      "CANNOT_REASSIGN_CUSTOM_KEY",
    );
  }
}
